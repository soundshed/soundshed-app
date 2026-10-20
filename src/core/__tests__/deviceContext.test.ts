import { beforeEach, describe, expect, it } from "vitest";
import { DeviceContext } from "../deviceContext";
import { VIRTUAL_CHANNEL } from "../sparkChannels";
import { BluetoothDeviceInfo } from "../../spork/src/interfaces/deviceController";
import { SerialCommsProvider } from "../../spork/src/interfaces/serialCommsProvider";

/**
 * Minimal transport. DeviceContext builds its own SparkDeviceManager around
 * whatever provider it is handed, so this is enough to drive the whole path.
 */
class FakeProvider implements SerialCommsProvider {
  public onDisconnected: (() => void) | null = null;
  public spark2 = false;
  public connectResult = true;
  public reconnectResult = true;
  public writeError: Error | null = null;

  async disconnect(): Promise<void> {}
  async connect(_d: BluetoothDeviceInfo): Promise<boolean> {
    return this.connectResult;
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
  async write(_buffer): Promise<void> {
    if (this.writeError) throw this.writeError;
  }
  async waitForAck(): Promise<boolean> {
    return true;
  }
  isSpark2Connection(): boolean {
    return this.spark2;
  }
  async reconnect(): Promise<boolean> {
    return this.reconnectResult;
  }
}

const DEVICE: BluetoothDeviceInfo = { name: "Spark 40 Audio", address: "a", port: null };

let provider: FakeProvider;
let context: DeviceContext;
let messages: { type: string; args: any }[];
/** Every sendCommand that reached the device manager, in order. */
let commands: { type: string; data: any }[];

/** The Preset model shape create_preset_from_model expects: 7 signal path entries. */
const buildPreset = () => ({
  meta: {
    id: "F39EE160-DE10-4646-8257-79178B688B62",
    name: "Test Tone",
    version: "0.7",
    description: "A tone used by the device context tests",
    icon: "icon.png",
  },
  bpm: 120,
  sigpath: [
    { dspId: "bias.noisegate", active: true, params: [{ value: 0.5 }] },
    { dspId: "Compressor", active: false, params: [{ value: 0.25 }] },
    { dspId: "Booster", active: true, params: [{ value: 0.5 }] },
    { dspId: "RolandJC120", active: true, params: [{ value: 0.5 }] },
    { dspId: "Cloner", active: false, params: [{ value: 0.5 }] },
    { dspId: "VintageDelay", active: true, params: [{ value: 0.25 }] },
    { dspId: "bias.reverb", active: true, params: [{ value: 0.5 }] },
  ],
});

beforeEach(async () => {
  provider = new FakeProvider();
  messages = [];
  commands = [];

  context = new DeviceContext();
  context.init(provider, (type, args) => messages.push({ type, args }));

  const originalSend = context.deviceManager.sendCommand.bind(context.deviceManager);
  context.deviceManager.sendCommand = async (type, data) => {
    commands.push({ type, data });
    return originalSend(type, data);
  };

  await context.performAction({ action: "connect", data: DEVICE });
  commands.length = 0;
});

describe("applying a preset", () => {
  it("resolves only after the upload and the channel switch have both completed", async () => {
    const result = await context.performAction({
      action: "applyPreset",
      data: buildPreset(),
    });

    expect(result).toBe(true);
    expect(commands.map((c) => c.type)).toEqual([
      "set_preset_from_model",
      "set_channel",
    ]);
  });

  it("switches to the virtual channel rather than a hardware slot", async () => {
    await context.performAction({ action: "applyPreset", data: buildPreset() });

    const channelCmd = commands.find((c) => c.type === "set_channel");
    expect(channelCmd.data).toBe(VIRTUAL_CHANNEL);
  });

  it("requests a live sync on a Spark 2", async () => {
    provider.spark2 = true;
    const spark2Context = new DeviceContext();
    spark2Context.init(provider, () => {});
    await spark2Context.performAction({
      action: "connect",
      data: { name: "Spark 2 Audio", address: "b", port: null },
    });

    const sent: string[] = [];
    const original = spark2Context.deviceManager.sendCommand.bind(
      spark2Context.deviceManager
    );
    spark2Context.deviceManager.sendCommand = async (type, data) => {
      sent.push(type);
      return original(type, data);
    };

    await spark2Context.performAction({ action: "applyPreset", data: buildPreset() });

    expect(sent).toContain("request_live_sync");
  });

  it("reports failure instead of throwing when the upload fails", async () => {
    context.deviceManager.sendCommand = async () => {
      throw new Error("BLE dropped mid-upload");
    };

    const result = await context.performAction({
      action: "applyPreset",
      data: buildPreset(),
    });

    expect(result).toBe(false);
  });

  it("does not switch channel if the upload failed", async () => {
    let calls = 0;
    context.deviceManager.sendCommand = async (type) => {
      calls++;
      commands.push({ type, data: null });
      throw new Error("failed");
    };

    await context.performAction({ action: "applyPreset", data: buildPreset() });

    expect(calls).toBe(1);
    expect(commands.map((c) => c.type)).toEqual(["set_preset_from_model"]);
  });
});

describe("re-reading the preset after an unexpected disconnect", () => {
  const dropConnection = async () => {
    provider.onDisconnected?.();
    // attemptReconnect waits 1500ms before retrying.
    await new Promise((r) => setTimeout(r, 1700));
  };

  it("re-reads the virtual channel after a tone was applied", async () => {
    await context.performAction({ action: "applyPreset", data: buildPreset() });
    commands.length = 0;

    await dropConnection();

    const getPreset = commands.find((c) => c.type === "get_preset");
    expect(getPreset).toBeDefined();
    // Reading slot 0 here is what showed the user a completely different tone.
    expect(getPreset.data).toBe(VIRTUAL_CHANNEL);
  });

  it("re-reads the hardware channel the user had selected", async () => {
    await context.performAction({ action: "setChannel", data: 2 });
    commands.length = 0;

    await dropConnection();

    expect(commands.find((c) => c.type === "get_preset").data).toBe(2);
  });

  it("re-reads the channel that was last explicitly queried", async () => {
    await context.performAction({ action: "getPreset", data: 3 });
    commands.length = 0;

    await dropConnection();

    expect(commands.find((c) => c.type === "get_preset").data).toBe(3);
  });

  it("falls back to slot 0 when nothing has been selected yet", async () => {
    commands.length = 0;

    await dropConnection();

    expect(commands.find((c) => c.type === "get_preset").data).toBe(0);
  });

  it("tells the app it is reconnecting and then connected", async () => {
    messages.length = 0;

    await dropConnection();

    const connectionEvents = messages
      .filter((m) => m.type === "device-connection-changed")
      .map((m) => m.args);

    expect(connectionEvents).toEqual(["disconnected", "reconnecting", "connected"]);
  });

  it("reports a failed reconnect", async () => {
    provider.reconnectResult = false;
    messages.length = 0;

    await dropConnection();

    const connectionEvents = messages
      .filter((m) => m.type === "device-connection-changed")
      .map((m) => m.args);

    expect(connectionEvents[connectionEvents.length - 1]).toBe("failed");
  });
});

describe("action results", () => {
  it("returns a promise for queries so callers can await them", async () => {
    await expect(
      context.performAction({ action: "getPreset", data: 1 })
    ).resolves.not.toBeInstanceOf(Error);

    expect(commands.map((c) => c.type)).toContain("get_preset");
  });

  it("defaults an out-of-range channel to slot 0", async () => {
    await context.performAction({ action: "getPreset", data: -1 });

    expect(commands.find((c) => c.type === "get_preset").data).toBe(0);
  });
});
