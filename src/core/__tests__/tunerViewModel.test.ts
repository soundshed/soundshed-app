import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  describeTunerReading,
  getNoteName,
  isInTune,
  needlePercent,
  offsetToCents,
  TRAILING_OUTPUT_GRACE_MS,
  TunerEvents,
  TunerViewModel,
} from "../tunerViewModel";
import { DeviceContext } from "../deviceContext";
import { TunerStateStore, initialTunerState } from "../../stores/tunerstate";
import { SparkCommandMessage } from "../../spork/src/devices/spark/sparkCommandMessage";
import { blocksToChunks } from "../../spork/src/devices/spark/__tests__/protocolTestUtils";
import { SerialCommsProvider } from "../../spork/src/interfaces/serialCommsProvider";

describe("note names", () => {
  it.each([
    [0, "C"],
    [1, "C#"],
    [4, "E"],
    [7, "G"],
    [9, "A"],
    [11, "B"],
  ])("maps note %i to %s", (note, name) => {
    expect(getNoteName(note)).toBe(name);
  });

  it("wraps values above B like Ignitron (note % 12)", () => {
    expect(getNoteName(12)).toBe("C");
    expect(getNoteName(21)).toBe("A");
  });

  it("treats 0x0e as no note", () => {
    expect(getNoteName(0x0e)).toBeNull();
  });

  it.each([null, undefined, -1, 1.5])("returns null for %s", (note) => {
    expect(getNoteName(note as any)).toBeNull();
  });
});

describe("offset to cents", () => {
  it.each([
    [0.5, 0],
    [0, -50],
    [1, 50],
    [0.25, -25],
    [0.62, 12],
    [0.47, -3],
  ])("offset %s is %i cents", (offset, cents) => {
    expect(offsetToCents(offset)).toBe(cents);
  });

  it("clamps out-of-range values to half a semitone", () => {
    expect(offsetToCents(-1)).toBe(-50);
    expect(offsetToCents(3)).toBe(50);
  });

  it.each([null, undefined, NaN, Infinity])("returns null for %s", (offset) => {
    expect(offsetToCents(offset as any)).toBeNull();
  });
});

describe("in tune and needle", () => {
  it.each([
    [0, true],
    [5, true],
    [-5, true],
    [6, false],
    [-6, false],
    [null, false],
  ])("%s cents in tune: %s", (cents, expected) => {
    expect(isInTune(cents)).toBe(expected);
  });

  it.each([
    [-50, 0],
    [-25, 25],
    [0, 50],
    [25, 75],
    [50, 100],
    [null, 50],
  ])("needle for %s cents sits at %s%%", (cents, percent) => {
    expect(needlePercent(cents)).toBe(percent);
  });
});

describe("describeTunerReading", () => {
  it("describes an in-tune A", () => {
    expect(describeTunerReading(9, 0.5)).toEqual({
      hasNote: true,
      noteName: "A",
      cents: 0,
      inTune: true,
      direction: "in-tune",
      needlePercent: 50,
      centsLabel: "0",
    });
  });

  it("describes a flat and a sharp note", () => {
    const flat = describeTunerReading(4, 0.3);
    expect(flat.direction).toBe("flat");
    expect(flat.centsLabel).toBe("-20");
    expect(flat.inTune).toBe(false);

    const sharp = describeTunerReading(4, 0.62);
    expect(sharp.direction).toBe("sharp");
    expect(sharp.centsLabel).toBe("+12");
  });

  it("shows no needle data when there is no note", () => {
    const r = describeTunerReading(0x0e, 0.9);
    expect(r.hasNote).toBe(false);
    expect(r.cents).toBeNull();
    expect(r.direction).toBeNull();
    expect(r.needlePercent).toBe(50);
  });
});

class FakeEvents implements TunerEvents {
  handlers = new Map<string, (event: any, args: any) => any>();
  invoke = vi.fn(async (_type: string, _data: any): Promise<any> => true);
  on(type: string, action: (event: any, args: any) => any) {
    this.handlers.set(type, action);
  }
  emit(type: string, args: any) {
    this.handlers.get(type)?.(type, args);
  }
}

describe("TunerViewModel", () => {
  let events: FakeEvents;
  let now: number;
  let vm: TunerViewModel;
  const state = () => TunerStateStore.getRawState();

  beforeEach(() => {
    TunerStateStore.update((s) => Object.assign(s, initialTunerState()));
    events = new FakeEvents();
    now = 10_000;
    vm = new TunerViewModel(events, () => now);
  });

  it("sends setTuner through perform-action and records the new state", async () => {
    const ok = await vm.setEnabled(true);

    expect(ok).toBe(true);
    expect(events.invoke).toHaveBeenCalledWith("perform-action", { action: "setTuner", data: true });
    expect(state().isEnabled).toBe(true);
    expect(state().isPending).toBe(false);
  });

  it("toggle flips the current state", async () => {
    await vm.toggle();
    expect(state().isEnabled).toBe(true);
    await vm.toggle();
    expect(state().isEnabled).toBe(false);
    expect(events.invoke).toHaveBeenLastCalledWith("perform-action", { action: "setTuner", data: false });
  });

  it("reverts when the command could not be sent", async () => {
    events.invoke.mockResolvedValueOnce(false);

    const ok = await vm.setEnabled(true);

    expect(ok).toBe(false);
    expect(state().isEnabled).toBe(false);
    expect(state().isPending).toBe(false);
  });

  it("stores readings from the amp", () => {
    events.emit("tuner-message", { type: "tuner_output", note: 9, offset: 0.55 });

    expect(state().note).toBe(9);
    expect(state().offset).toBe(0.55);
    expect(state().lastReadingAt).toBe(now);
  });

  it("follows the tuner being switched on and off at the amp", () => {
    events.emit("tuner-message", { type: "tuner_onoff", enabled: true });
    expect(state().isEnabled).toBe(true);

    events.emit("tuner-message", { type: "tuner_output", note: 2, offset: 0.5 });
    events.emit("tuner-message", { type: "tuner_onoff", enabled: false });

    expect(state().isEnabled).toBe(false);
    expect(state().note).toBeNull();
    expect(state().offset).toBeNull();
  });

  it("treats a reading while off as the tuner having been switched on at the amp", () => {
    events.emit("tuner-message", { type: "tuner_output", note: 4, offset: 0.5 });

    expect(state().isEnabled).toBe(true);
    expect(state().note).toBe(4);
  });

  it("ignores readings still in flight just after switching the tuner off", async () => {
    await vm.setEnabled(true);
    await vm.setEnabled(false);

    now += 200;
    events.emit("tuner-message", { type: "tuner_output", note: 4, offset: 0.5 });
    expect(state().isEnabled).toBe(false);
    expect(state().note).toBeNull();

    now += TRAILING_OUTPUT_GRACE_MS;
    events.emit("tuner-message", { type: "tuner_output", note: 4, offset: 0.5 });
    expect(state().isEnabled).toBe(true);
  });

  it("ignores messages that are not tuner messages", () => {
    vm.handleMessage({ type: "hardware_bpm", value: 120 });
    vm.handleMessage(null);

    expect(state()).toEqual(initialTunerState());
  });

  it("reset forgets everything", async () => {
    await vm.setEnabled(true);
    events.emit("tuner-message", { type: "tuner_output", note: 4, offset: 0.5 });

    vm.reset();

    expect(state()).toEqual(initialTunerState());
  });
});

class QuietProvider implements SerialCommsProvider {
  written: Uint8Array[] = [];
  onDisconnected: (() => void) | null = null;
  async disconnect(): Promise<void> {}
  async connect(): Promise<boolean> {
    return true;
  }
  async scanForDevices(): Promise<any> {
    return [];
  }
  async beginQueuedReceive(): Promise<boolean> {
    return true;
  }
  readReceiveQueue(): Array<Uint8Array> {
    return null;
  }
  peekReceiveQueueEnd(): Uint8Array {
    return null;
  }
  async write(buffer): Promise<void> {
    this.written.push(new Uint8Array(buffer));
  }
  isSpark2Connection(): boolean {
    return false;
  }
}

describe("DeviceContext tuner routing", () => {
  it("forwards tuner messages from the amp as tuner-message only", async () => {
    const sent: { type: string; args: any }[] = [];
    const context = new DeviceContext();
    context.init(new QuietProvider(), (type, args) => sent.push({ type, args }));

    const reading = new SparkCommandMessage();
    reading.start_message(0x03, 0x64);
    reading.add_bytes(Uint8Array.from([9]));
    reading.add_float(0.5);

    await context.deviceManager.readStateMessage(blocksToChunks(reading.end_message()));

    expect(sent).toEqual([{ type: "tuner-message", args: { type: "tuner_output", note: 9, offset: 0.5 } }]);
    await context.deviceManager.disconnect();
  });

  it("handles the setTuner action by sending switch_tuner", async () => {
    const provider = new QuietProvider();
    const context = new DeviceContext();
    context.init(provider, () => {});

    await context.performAction({ action: "setTuner", data: true });

    expect(provider.written.map((w) => Array.from(w))).toEqual(
      new SparkCommandMessage().switch_tuner(true).map((b) => Array.from(b))
    );
  });
});
