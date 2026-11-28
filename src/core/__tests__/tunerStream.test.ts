import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BleProvider } from "../../spork/src/devices/spark/bleProvider";
import { SparkCommandMessage } from "../../spork/src/devices/spark/sparkCommandMessage";
import { DeviceContext } from "../deviceContext";
import { TunerEvents, TunerViewModel } from "../tunerViewModel";
import { initialTunerState, TunerStateStore } from "../../stores/tunerstate";

// The whole path the user saw fail on a Spark 2 ("the tuner does not work"): a BLE
// provider receiving a tuner reading every 60 ms, SparkDeviceManager's read loop,
// DeviceContext and TunerViewModel.

function readingBlock(note: number, offset: number): Uint8Array {
  const msg = new SparkCommandMessage();
  msg.start_message(0x03, 0x64);
  msg.add_bytes(Uint8Array.from([note]));
  msg.add_float(offset);
  return msg.end_message()[0];
}

const TUNER_ON = Array.from(new SparkCommandMessage().switch_tuner(true)[0]);
const TUNER_OFF = Array.from(new SparkCommandMessage().switch_tuner(false)[0]);

class BridgeEvents implements TunerEvents {
  handlers = new Map<string, (event: any, args: any) => any>();
  context: DeviceContext;
  on(type: string, action: (event: any, args: any) => any) {
    this.handlers.set(type, action);
  }
  emit(type: string, args: any) {
    this.handlers.get(type)?.(type, args);
  }
  invoke(_type: string, data: any): Promise<any> {
    return this.context.performAction(data);
  }
}

describe("a Spark 2 tuner streaming over BLE", () => {
  let provider: any;
  let context: DeviceContext;
  let vm: TunerViewModel;
  let writes: { at: number; bytes: number[] }[];
  let ampTunerOn: boolean;
  let ampStream: ReturnType<typeof setInterval>;
  let start: number;
  const state = () => TunerStateStore.getRawState();

  beforeEach(async () => {
    vi.useFakeTimers();
    start = Date.now();
    TunerStateStore.update((s) => Object.assign(s, initialTunerState()));

    provider = new BleProvider();
    writes = [];
    let notify: (event: any) => void = () => {};

    // A fake amp: a reading every 60 ms while its tuner is on (left on before we
    // connected), switched by 0x01 0x65.
    ampTunerOn = true;
    provider.commandCharacteristic = {
      writeValueWithoutResponse: async (b: Uint8Array) => {
        const bytes = Array.from(b);
        writes.push({ at: Date.now() - start, bytes });
        if (JSON.stringify(bytes) == JSON.stringify(TUNER_OFF)) ampTunerOn = false;
        if (JSON.stringify(bytes) == JSON.stringify(TUNER_ON)) ampTunerOn = true;
      },
    };
    provider.changeCharacteristic = {
      startNotifications: async () => {},
      stopNotifications: async () => {},
      addEventListener: (_type: string, handler: (event: any) => void) => (notify = handler),
      removeEventListener: () => {},
    };

    let n = 0;
    ampStream = setInterval(() => {
      if (!ampTunerOn) return;
      const data = n++ % 10 == 9 ? readingBlock(0, -1) : readingBlock(9, 0.55);
      notify({ target: { value: new DataView(data.buffer) }, timeStamp: Date.now() });
    }, 60);

    const events = new BridgeEvents();
    context = new DeviceContext();
    context.init(provider, (type, args) => events.emit(type, args));
    events.context = context;
    vm = new TunerViewModel(events, () => Date.now());

    await context.deviceManager.startReceiver();
  });

  afterEach(async () => {
    clearInterval(ampStream);
    await context.deviceManager.disconnect();
    vm.dispose();
    vi.useRealTimers();
  });

  it("shows a tuner left on at the amp, with live readings", async () => {
    await vi.advanceTimersByTimeAsync(1000);

    expect(state().isEnabled).toBe(true);
    expect(state().note).not.toBeNull();
    expect(Date.now() - state().lastReadingAt).toBeLessThanOrEqual(120);
  });

  it("switches the tuner off although the readings never pause", async () => {
    await vi.advanceTimersByTimeAsync(1000);
    expect(state().isEnabled).toBe(true);

    const startedAt = Date.now() - start;
    const off = vm.setEnabled(false);
    expect(state().isEnabled).toBe(false);

    await vi.advanceTimersByTimeAsync(1500);
    await expect(off).resolves.toBe(true);

    const offWrite = writes.find((w) => JSON.stringify(w.bytes) == JSON.stringify(TUNER_OFF));
    expect(offWrite).toBeDefined();
    // the first command waits 500 ms (min gap) + at most 600 ms for quiet
    expect(offWrite.at - startedAt).toBeLessThanOrEqual(1100);
    expect(ampTunerOn).toBe(false);

    await vi.advanceTimersByTimeAsync(3000);
    expect(state().isEnabled).toBe(false);
    expect(state().isPending).toBe(false);
    expect(state().note).toBeNull();
    expect(state().error).toBeNull();
  });

  it("shows the tuner as on again if the amp missed the switch-off", async () => {
    await vi.advanceTimersByTimeAsync(1000);
    // an amp in tuner mode may drop what it is sent
    provider.commandCharacteristic.writeValueWithoutResponse = async () => {};

    const off = vm.setEnabled(false);
    await vi.advanceTimersByTimeAsync(1500);
    await off;
    expect(state().isEnabled).toBe(false);

    // readings past the grace window mean the tuner is still on
    await vi.advanceTimersByTimeAsync(2000);
    expect(state().isEnabled).toBe(true);
    expect(state().note).not.toBeNull();
  });
});
