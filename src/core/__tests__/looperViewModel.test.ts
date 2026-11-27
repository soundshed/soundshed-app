import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Store } from "pullstate";
import {
  applyLooperCommand,
  countInDurationMs,
  getLooperButtonLabels,
  getLooperStatusText,
  getLooperSupport,
  LooperDevice,
  LooperViewModel,
  measureToPosition,
} from "../looperViewModel";
import { DEFAULT_LOOPER_SETTINGS, LooperCommand, LooperSettings } from "../../spork/src/devices/spark/sparkLooper";
import { ILooperState, initialLooperState } from "../../stores/looperstate";

vi.spyOn(console, "debug").mockImplementation(() => {});

class FakeLooperDevice implements LooperDevice {
  public onStateChanged: any = null;
  public sent: number[] = [];
  public settingsSent: Partial<LooperSettings>[] = [];
  public stateRequests = 0;
  public fail = false;

  async sendLooperCommand(command: LooperCommand) {
    if (this.fail) throw new Error("write failed");
    this.sent.push(command);
  }

  async updateLooperSettings(settings: Partial<LooperSettings>) {
    if (this.fail) throw new Error("write failed");
    this.settingsSent.push(settings);
  }

  async requestLooperState() {
    this.stateRequests++;
  }

  isSpark2Device() {
    return true;
  }
}

const state = (patch: Partial<ILooperState> = {}): ILooperState => ({ ...initialLooperState(), ...patch });

let store: Store<ILooperState>;
let connection: Store<{ isConnected: boolean }>;
let device: FakeLooperDevice;
let vm: LooperViewModel;

const setState = (patch: Partial<ILooperState>) => store.update((s) => { Object.assign(s, patch); });
const current = () => store.getRawState();

beforeEach(() => {
  store = new Store<ILooperState>(initialLooperState());
  connection = new Store({ isConnected: true });
  device = new FakeLooperDevice();
  vm = new LooperViewModel(store, connection);
  vm.attach(device);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("getLooperSupport", () => {
  it("enables the looper for a Spark 2 by name or by transport detection", () => {
    expect(getLooperSupport(true, "Spark 2 BLE")).toBe("spark2");
    expect(getLooperSupport(true, "Spark 40 Audio", true)).toBe("spark2");
  });

  it("reports other Spark models and unidentified amps separately", () => {
    expect(getLooperSupport(true, "Spark 40 Audio")).toBe("other");
    expect(getLooperSupport(true, "Spark MINI")).toBe("other");
    expect(getLooperSupport(true, "")).toBe("unknown");
    expect(getLooperSupport(true, "My Amp")).toBe("unknown");
  });

  it("is disconnected when no amp is connected", () => {
    expect(getLooperSupport(false, "Spark 2")).toBe("disconnected");
  });
});

describe("applyLooperCommand", () => {
  it("follows Ignitron's updateLooperCommand transitions", () => {
    expect(applyLooperCommand(state(), LooperCommand.Record)).toMatchObject({ isRecording: true });
    expect(applyLooperCommand(state(), LooperCommand.RecordComplete)).toMatchObject({ isRecording: false, hasLoop: true });
    expect(applyLooperCommand(state(), LooperCommand.StopDub)).toMatchObject({ isRecording: false, hasLoop: true });
    expect(applyLooperCommand(state(), LooperCommand.Play)).toMatchObject({ isPlaying: true });
    expect(applyLooperCommand(state(), LooperCommand.Stop)).toMatchObject({ isPlaying: false });
    expect(applyLooperCommand(state(), LooperCommand.Undo)).toMatchObject({ canRedo: true });
    expect(applyLooperCommand(state(), LooperCommand.Redo)).toMatchObject({ canRedo: false });
    expect(applyLooperCommand(state(), LooperCommand.Dub)).toMatchObject({ isRecording: true, canRedo: false });
  });

  it("clears everything on delete", () => {
    expect(
      applyLooperCommand(state({ hasLoop: true, isPlaying: true, canRedo: true, loopCount: 3 }), LooperCommand.Delete)
    ).toMatchObject({ hasLoop: false, isPlaying: false, canRedo: false, loopCount: 0 });
  });

  it("ignores unknown commands", () => {
    expect(applyLooperCommand(state(), 0x42)).toEqual({});
  });
});

describe("button labels", () => {
  it.each([
    [state(), "Rec", "Play", "Undo", "Empty"],
    [state({ isCountingIn: true }), "Cancel Count-in", "Stop", "Undo", "Count-in"],
    [state({ isRecording: true }), "Stop Rec", "Stop", "Undo", "Recording"],
    [state({ hasLoop: true }), "Dub", "Play", "Undo", "Stopped"],
    [state({ hasLoop: true, isPlaying: true }), "Dub", "Stop", "Undo", "Playing"],
    [state({ hasLoop: true, isPlaying: true, isRecording: true }), "Stop Dub", "Stop", "Undo", "Overdubbing"],
    [state({ hasLoop: true, canRedo: true }), "Dub", "Play", "Redo", "Stopped"],
  ])("labels %o", (s, recDub, playStop, undoRedo, status) => {
    expect(getLooperButtonLabels(s)).toEqual({ recDub, playStop, undoRedo });
    expect(getLooperStatusText(s)).toBe(status);
  });
});

describe("measureToPosition", () => {
  it("maps the loop position to bar and beat", () => {
    expect(measureToPosition(0, 4)).toEqual({ bar: 1, beat: 1 });
    expect(measureToPosition(0.5, 4)).toEqual({ bar: 3, beat: 1 });
    expect(measureToPosition(0.3, 4)).toEqual({ bar: 2, beat: 1 });
    expect(measureToPosition(0.99, 4)).toEqual({ bar: 4, beat: 4 });
    expect(measureToPosition(1, 2)).toEqual({ bar: 2, beat: 4 });
  });

  it("returns null without a known bar count or position", () => {
    expect(measureToPosition(0.5, null)).toBeNull();
    expect(measureToPosition(null, 4)).toBeNull();
  });
});

describe("countInDurationMs", () => {
  it("is one 4/4 bar at the looper tempo", () => {
    expect(countInDurationMs(120)).toBe(2000);
    expect(countInDurationMs(60)).toBe(4000);
    expect(countInDurationMs(0)).toBe(2000);
  });
});

describe("device messages", () => {
  it("consumes looper messages and forwards everything else", () => {
    const forwarded: any[] = [];
    const dev = new FakeLooperDevice();
    dev.onStateChanged = (s: any) => forwarded.push(s.message.type);
    vm = new LooperViewModel(store, connection);
    vm.attach(dev);

    dev.onStateChanged({ message: { type: "looper_measure", measure: 0.25 } });
    dev.onStateChanged({ message: { type: "fx_toggled", dspId: "x", active: true } });
    dev.onStateChanged({ message: { type: "hardware_bpm", bpm: 98 } });

    expect(forwarded).toEqual(["fx_toggled", "hardware_bpm"]);
    expect(current().measure).toBe(0.25);
    expect(current().ampBpm).toBe(98);
  });

  it("attaches only once to the same device", () => {
    const dev = new FakeLooperDevice();
    const original = vi.fn();
    dev.onStateChanged = original;
    vm = new LooperViewModel(store, connection);
    vm.attach(dev);
    vm.attach(dev);

    dev.onStateChanged({ message: { type: "preset" } });

    expect(original).toHaveBeenCalledTimes(1);
  });

  it("applies commands the amp reports, e.g. from its own footswitch", () => {
    vm.handleDeviceMessage({ type: "looper_command", command: LooperCommand.Record } as any);
    expect(current()).toMatchObject({ isRecording: true, lastCommand: LooperCommand.Record });
  });

  it("stores settings and raises hasLoop from the status loop count", () => {
    const settings = { ...DEFAULT_LOOPER_SETTINGS, bpm: 140 };
    vm.handleDeviceMessage({ type: "looper_settings", settings } as any);
    vm.handleDeviceMessage({ type: "looper_status", status: { bpm: 140, count: 4, bars: 4, loopCount: 2, unknown1: 0, unknown2: 0 } } as any);

    expect(current().settings).toEqual(settings);
    expect(current()).toMatchObject({ loopCount: 2, hasLoop: true });

    // like Ignitron, a status with no loops never hides a loop we know about
    vm.handleDeviceMessage({ type: "looper_status", status: { bpm: 140, count: 4, bars: 4, loopCount: 0, unknown1: 0, unknown2: 0 } } as any);
    expect(current()).toMatchObject({ loopCount: 0, hasLoop: true });
  });

  it("keeps the first loop when the refresh after recording reports no loops", async () => {
    setState({ isRecording: true });
    await vm.recDub();
    expect(current().hasLoop).toBe(true);

    vm.handleDeviceMessage({ type: "looper_status", status: { bpm: 120, count: 4, bars: 4, loopCount: 0, unknown1: 0, unknown2: 0 } } as any);

    expect(current().hasLoop).toBe(true);
    expect(getLooperButtonLabels(current()).recDub).toBe("Dub");
  });
});

describe("transport actions", () => {
  it("exposes a raw typed command for input mappings", async () => {
    expect(await vm.looperCommand(LooperCommand.Play)).toBe(true);
    expect(device.sent).toEqual([LooperCommand.Play]);
    expect(current().isPlaying).toBe(true);
  });

  it("records straight away when the click is off", async () => {
    setState({ settings: { ...DEFAULT_LOOPER_SETTINGS, click: false } });

    await vm.performLooperAction("rec-dub");

    expect(device.sent).toEqual([LooperCommand.Record]);
    expect(current().isRecording).toBe(true);
  });

  it("counts in for one bar before recording when the click is on", async () => {
    vi.useFakeTimers();
    setState({ settings: { ...DEFAULT_LOOPER_SETTINGS, click: true, bpm: 120 } });

    await vm.recDub();
    expect(device.sent).toEqual([LooperCommand.CountIn]);
    expect(current().isCountingIn).toBe(true);

    await vi.advanceTimersByTimeAsync(2000);

    expect(device.sent).toEqual([LooperCommand.CountIn, LooperCommand.Record]);
    expect(current()).toMatchObject({ isCountingIn: false, isRecording: true });
  });

  it("drops the count-in and transport state when the amp disconnects", async () => {
    vi.useFakeTimers();
    setState({ settings: { ...DEFAULT_LOOPER_SETTINGS, click: true, bpm: 120 } });
    await vm.recDub();
    expect(current().isCountingIn).toBe(true);

    connection.update((s) => { s.isConnected = false; });
    expect(current()).toMatchObject({ isCountingIn: false, isRecording: false });
    expect(current().settings?.bpm).toBe(120);

    // a quick reconnect inside the count-in bar must not start a recording
    connection.update((s) => { s.isConnected = true; });
    await vi.advanceTimersByTimeAsync(5000);
    expect(device.sent).toEqual([LooperCommand.CountIn]);
  });

  it("clears stale transport state on disconnect", () => {
    setState({ isRecording: true, isPlaying: true, hasLoop: true, loopCount: 3 });

    connection.update((s) => { s.isConnected = false; });

    expect(current()).toMatchObject({ isRecording: false, isPlaying: false, hasLoop: false, loopCount: 0 });
  });

  it("cancels a count-in without starting the recording", async () => {
    vi.useFakeTimers();
    setState({ settings: { ...DEFAULT_LOOPER_SETTINGS, click: true } });

    await vm.recDub();
    await vm.playStop();
    await vi.advanceTimersByTimeAsync(5000);

    expect(device.sent).toEqual([LooperCommand.CountIn, LooperCommand.Stop]);
    expect(current()).toMatchObject({ isCountingIn: false, isRecording: false });
  });

  it("closes the first recording and plays it back", async () => {
    setState({ isRecording: true });

    await vm.recDub();

    expect(device.sent).toEqual([LooperCommand.StopRecord, LooperCommand.RecordComplete, LooperCommand.Play]);
    expect(current()).toMatchObject({ isRecording: false, hasLoop: true, isPlaying: true });
    expect(device.stateRequests).toBe(1);
  });

  it("overdubs an existing loop and stops the dub", async () => {
    setState({ hasLoop: true, isPlaying: true });

    await vm.recDub();
    expect(device.sent).toEqual([LooperCommand.Dub, LooperCommand.Play]);
    expect(current().isRecording).toBe(true);

    await vm.recDub();
    expect(device.sent.slice(2)).toEqual([LooperCommand.StopDub]);
    expect(current()).toMatchObject({ isRecording: false, hasLoop: true, isPlaying: true });
  });

  it("play/stop toggles playback", async () => {
    setState({ hasLoop: true });

    await vm.playStop();
    await vm.playStop();

    expect(device.sent).toEqual([LooperCommand.Play, LooperCommand.Stop]);
    expect(current().isPlaying).toBe(false);
  });

  it("stopping during a first recording also completes it", async () => {
    setState({ isRecording: true });

    await vm.playStop();

    expect(device.sent).toEqual([LooperCommand.Stop, LooperCommand.StopRecord, LooperCommand.RecordComplete]);
  });

  it("undo/redo alternates once a layer was undone", async () => {
    setState({ hasLoop: true });

    await vm.undoRedo();
    await vm.undoRedo();

    expect(device.sent).toEqual([LooperCommand.Undo, LooperCommand.Redo]);
  });

  it("does nothing for undo without a loop", async () => {
    expect(await vm.undoRedo()).toBe(false);
    expect(device.sent).toEqual([]);
  });

  it("deletes the loop", async () => {
    setState({ hasLoop: true, isPlaying: true, loopCount: 2 });

    await vm.performLooperAction("delete");

    expect(device.sent).toEqual([LooperCommand.Delete]);
    expect(current()).toMatchObject({ hasLoop: false, isPlaying: false, loopCount: 0 });
  });

  it("reports a failed write and leaves the state alone", async () => {
    device.fail = true;

    expect(await vm.looperCommand(LooperCommand.Play)).toBe(false);
    expect(current().isPlaying).toBe(false);
    expect(current().lastError).toMatch(/could not send/i);
  });

  it("refuses to act before a device is attached and says so", async () => {
    const detached = new LooperViewModel(store, connection);
    expect(await detached.looperCommand(LooperCommand.Play)).toBe(false);
    expect(current().lastError).toMatch(/not linked/i);

    setState({ lastError: null });
    expect(await detached.refresh()).toBe(false);
    expect(current().lastError).toMatch(/not linked/i);

    setState({ lastError: null });
    expect(await detached.applySettings({ bpm: 100 })).toBe(false);
    expect(current().lastError).toMatch(/not linked/i);
  });

  it("reports a failed refresh and clears the error once a refresh succeeds", async () => {
    device.requestLooperState = async () => { throw new Error("write failed"); };
    expect(await vm.refresh()).toBe(false);
    expect(current().lastError).toMatch(/could not read the looper state/i);

    device.requestLooperState = async () => {};
    expect(await vm.refresh()).toBe(true);
    expect(current().lastError).toBeNull();
  });
});

describe("settings", () => {
  it("keeps the fields the UI does not edit", async () => {
    setState({ settings: { ...DEFAULT_LOOPER_SETTINGS, unknownOnOff: true, maxDuration: 30000 } });

    await vm.applySettings({ bpm: 150, bars: 8 });

    expect(device.settingsSent[0]).toEqual({
      ...DEFAULT_LOOPER_SETTINGS,
      bpm: 150,
      bars: 8,
      unknownOnOff: true,
      maxDuration: 30000,
    });
    expect(current().settings?.bpm).toBe(150);
  });

  it("sends bpm / 4 as bars for a free length loop, as Ignitron does", async () => {
    await vm.applySettings({ bpm: 100, free: true });

    expect(device.settingsSent[0]).toMatchObject({ free: true, bars: 25 });
  });

  it("clamps an out of range bpm", async () => {
    await vm.applySettings({ bpm: 999 });

    expect(device.settingsSent[0].bpm).toBe(255);
  });
});

describe("reset", () => {
  it("clears transport state but keeps settings and amp tempo", () => {
    const settings = { ...DEFAULT_LOOPER_SETTINGS, bpm: 99 };
    setState({ isPlaying: true, hasLoop: true, settings, ampBpm: 101 });

    vm.reset();

    expect(current()).toMatchObject({ isPlaying: false, hasLoop: false, settings, ampBpm: 101 });
  });
});
