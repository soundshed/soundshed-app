import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BluetoothDeviceInfo } from "../../../interfaces/deviceController";
import { DeviceState } from "../../../interfaces/preset";
import { SerialCommsProvider } from "../../../interfaces/serialCommsProvider";
import { SparkCommandMessage } from "../sparkCommandMessage";
import { SparkDeviceManager } from "../sparkDeviceManager";
import { blocksToChunks, buildTestPreset } from "./protocolTestUtils";

class FakeConnection implements SerialCommsProvider {
  public written: Uint8Array[] = [];
  public queue: Uint8Array[] = [];
  public connectResult = true;
  public reconnectResult = true;
  public reconnectCalls = 0;
  public disconnectCalls = 0;
  public beginReceiveCalls = 0;
  public receiveResult = true;
  public ackResult = true;
  public ackWaits: { cmd: number | number[]; subCmd: number }[] = [];
  public spark2 = false;
  public onDisconnected: (() => void) | null = null;

  async disconnect(): Promise<void> {
    this.disconnectCalls++;
  }

  async connect(_device: BluetoothDeviceInfo): Promise<boolean> {
    return this.connectResult;
  }

  async scanForDevices(): Promise<any> {
    return [];
  }

  async beginQueuedReceive(): Promise<boolean> {
    this.beginReceiveCalls++;
    return this.receiveResult;
  }

  readReceiveQueue(): Array<Uint8Array> {
    const q = this.queue;
    this.queue = [];
    return q.length ? q : null;
  }

  peekReceiveQueueEnd(): Uint8Array {
    return this.queue[this.queue.length - 1] ?? null;
  }

  async write(buffer): Promise<void> {
    this.written.push(new Uint8Array(buffer));
  }

  async waitForAck(cmd: number | number[], subCmd: number): Promise<boolean> {
    this.ackWaits.push({ cmd, subCmd });
    return this.ackResult;
  }

  isSpark2Connection(): boolean {
    return this.spark2;
  }

  async reconnect(): Promise<boolean> {
    this.reconnectCalls++;
    return this.reconnectResult;
  }
}

const SPARK_40: BluetoothDeviceInfo = { name: "Spark 40 Audio", address: "a", port: null };
const SPARK_2: BluetoothDeviceInfo = { name: "Spark 2 Audio", address: "b", port: null };

let connection: FakeConnection;
let manager: SparkDeviceManager;

beforeEach(() => {
  vi.useFakeTimers();
  connection = new FakeConnection();
  manager = new SparkDeviceManager(connection);
});

afterEach(async () => {
  await manager.disconnect();
  vi.useRealTimers();
});

describe("hexToUint8Array", () => {
  it("parses a hex string into bytes", () => {
    expect(Array.from(manager.hexToUint8Array("01fe00f7"))).toEqual([
      0x01, 0xfe, 0x00, 0xf7,
    ]);
  });

  it("returns an empty array for an empty string", () => {
    expect(manager.hexToUint8Array("").length).toBe(0);
  });

  it("preserves high bytes rather than truncating them", () => {
    expect(Array.from(manager.hexToUint8Array("80ff"))).toEqual([0x80, 0xff]);
  });

  it("round-trips a captured frame back to the same hex", () => {
    const hex = "f0013a15010638c3f7";
    const bytes = manager.hexToUint8Array(hex);
    const backToHex = Array.from(bytes)
      .map((b) => ("00" + b.toString(16)).slice(-2))
      .join("");

    expect(backToHex).toBe(hex);
  });
});

describe("Spark 2 detection", () => {
  it("detects a Spark 2 from the advertised device name", async () => {
    // A transport that cannot report the model leaves name sniffing in charge.
    connection.isSpark2Connection = undefined;
    await manager.connect(SPARK_2);

    expect(manager.isSpark2Device()).toBe(true);
  });

  it("treats a Spark 40 as a non-Spark-2 device", async () => {
    connection.isSpark2Connection = undefined;
    await manager.connect(SPARK_40);

    expect(manager.isSpark2Device()).toBe(false);
  });

  it("lets the transport override name-based detection once connected", async () => {
    connection.spark2 = true;
    await manager.connect(SPARK_40);

    expect(manager.isSpark2Device()).toBe(true);
  });

  it("does not let the transport veto name-based detection", async () => {
    // A genuine Spark 2 may only expose the legacy FFC0 service, so the transport
    // reports a non-Spark-2 connection. The device is still a Spark 2 and must keep
    // the chunked, acked preset upload — otherwise it drops the BLE link mid-transfer.
    connection.spark2 = false;
    await manager.connect(SPARK_2);

    expect(manager.isSpark2Device()).toBe(true);
  });

  it("does not start the receiver when the connection fails", async () => {
    connection.connectResult = false;

    const connected = await manager.connect(SPARK_40);

    expect(connected).toBe(false);
    expect(connection.beginReceiveCalls).toBe(0);
  });
});

describe("readStateMessage", () => {
  it("emits decoded messages to the state change handler", async () => {
    const states: DeviceState[] = [];
    manager.onStateChanged = (s: DeviceState) => states.push({ ...s });

    const blocks = new SparkCommandMessage().change_hardware_preset(2);
    await manager.readStateMessage(blocksToChunks(blocks));

    expect(states).toHaveLength(1);
    expect(states[0].selectedPresetNumber).toBe(2);
    expect(states[0].message.type).toBe("hardware_channel_current");
  });

  it("returns the decoded message list", async () => {
    const blocks = new SparkCommandMessage().turn_effect_onoff("Cloner", "On");

    const messages = await manager.readStateMessage(blocksToChunks(blocks));

    expect(messages.map((m) => m.type)).toEqual(["fx_toggled"]);
  });

  it("does not throw when no state change handler is registered", async () => {
    const blocks = new SparkCommandMessage().change_hardware_preset(1);

    await expect(
      manager.readStateMessage(blocksToChunks(blocks))
    ).resolves.toBeDefined();
  });

  it("gives every effect in the signal path a display name", async () => {
    const blocks = new SparkCommandMessage().create_preset(buildTestPreset());

    const messages = await manager.readStateMessage(blocksToChunks(blocks));
    const preset = messages.find((m) => m.type === "preset")?.value;

    expect(preset.sigpath).toHaveLength(7);
    for (const fx of preset.sigpath) {
      expect(fx.name).toBeTruthy();
    }
  });

  it("falls back to generic parameter names for an effect missing from the catalog", async () => {
    const unknown = buildTestPreset();
    unknown.Pedals[2] = {
      Name: "NotARealEffect",
      OnOff: "On",
      Parameters: [0.5, 0.25],
    };
    const blocks = new SparkCommandMessage().create_preset(unknown);

    const messages = await manager.readStateMessage(blocksToChunks(blocks));
    const preset = messages.find((m) => m.type === "preset")?.value;

    expect(preset.sigpath[2].description).toBe("(No description)");
    expect(preset.sigpath[2].params.map((p) => p.name)).toEqual([
      "Param 0",
      "Param 1",
    ]);
  });

  it("does not replay messages on a second read", async () => {
    const blocks = blocksToChunks(
      new SparkCommandMessage().change_hardware_preset(1)
    );

    await manager.readStateMessage(blocks);
    const second = await manager.readStateMessage([]);

    expect(second).toHaveLength(0);
  });
});

describe("sendCommand", () => {
  it("writes the encoded command to the transport", async () => {
    await manager.sendCommand("set_channel", 2);

    expect(connection.written).toHaveLength(1);
    const chunk = blocksToChunks(connection.written)[0];
    expect(chunk[4]).toBe(0x01);
    expect(chunk[5]).toBe(0x38);
  });

  it.each([
    ["get_selected_channel", 0x10],
    ["get_device_name", 0x11],
    ["get_device_serial", 0x23],
  ])("maps %s to info sub-command 0x%s", async (type, subCmd) => {
    await manager.sendCommand(type, null);

    const chunk = blocksToChunks(connection.written)[0];
    expect(chunk[4]).toBe(0x02);
    expect(chunk[5]).toBe(subCmd);
  });

  it("writes nothing for an unrecognised command type", async () => {
    await manager.sendCommand("not_a_real_command", {});

    expect(connection.written).toHaveLength(0);
  });

  it("round-trips a command through the transport back into a message", async () => {
    await manager.sendCommand("set_fx_param", {
      dspId: "Booster",
      index: 0,
      value: 0.5,
    });

    const messages = await manager.readStateMessage(
      blocksToChunks(connection.written)
    );

    expect(messages[0].type).toBe("fx_param_msg");
    expect(messages[0].value).toBe(0.5);
  });
});

describe("Spark 2 chunked preset upload", () => {
  beforeEach(async () => {
    connection.spark2 = true;
    await manager.connect(SPARK_2);
  });

  it("waits for an ack after every chunk", async () => {
    await manager.sendCommand("set_preset", buildTestPreset());

    expect(connection.written.length).toBeGreaterThan(1);
    expect(connection.ackWaits).toHaveLength(connection.written.length);
  });

  it("expects the final-chunk ack only on the last chunk", async () => {
    await manager.sendCommand("set_preset", buildTestPreset());

    const expected = connection.ackWaits.map((a) => a.cmd);
    const last = expected.pop();

    expect(last).toEqual([0x04]);
    expect(expected.every((c) => Array.isArray(c) && c[0] === 0x05)).toBe(true);
  });

  it("keeps sending remaining chunks even if an ack times out", async () => {
    connection.ackResult = false;

    await manager.sendCommand("set_preset", buildTestPreset());

    expect(connection.written.length).toBeGreaterThan(1);
  });

  it("does not use the chunked path for a Spark 40", async () => {
    const spark40Connection = new FakeConnection();
    const spark40Manager = new SparkDeviceManager(spark40Connection);
    await spark40Manager.connect(SPARK_40);

    await spark40Manager.sendCommand("set_channel", 1);

    expect(spark40Connection.ackWaits).toHaveLength(0);
    await spark40Manager.disconnect();
  });
});

describe("connection loss and reconnect", () => {
  it("notifies the owner when the transport drops", async () => {
    const onLost = vi.fn();
    manager.onConnectionLost = onLost;
    await manager.connect(SPARK_40);

    connection.onDisconnected();

    expect(onLost).toHaveBeenCalledTimes(1);
  });

  it("restarts the receive loop after a successful reconnect", async () => {
    await manager.connect(SPARK_40);
    const receivesBefore = connection.beginReceiveCalls;

    const ok = await manager.reconnect();

    expect(ok).toBe(true);
    expect(connection.reconnectCalls).toBe(1);
    expect(connection.beginReceiveCalls).toBe(receivesBefore + 1);
  });

  it("does not restart the receive loop when reconnect fails", async () => {
    await manager.connect(SPARK_40);
    connection.reconnectResult = false;
    const receivesBefore = connection.beginReceiveCalls;

    const ok = await manager.reconnect();

    expect(ok).toBe(false);
    expect(connection.beginReceiveCalls).toBe(receivesBefore);
  });

  it("reports failure when the transport cannot reconnect at all", async () => {
    const basic = new FakeConnection();
    // reconnect() is a prototype method, so shadow it rather than deleting it.
    basic.reconnect = undefined;
    const basicManager = new SparkDeviceManager(basic);

    await expect(basicManager.reconnect()).resolves.toBe(false);
  });

  describe("when the amp's notifications cannot be subscribed to", () => {
    // Without notifications nothing the amp says is ever received. Reporting success
    // left the app "connected" to an amp it could not hear, and the transport kept
    // its link up, so later attempts short-circuited and never recovered.
    it("reports the connection as failed", async () => {
      connection.receiveResult = false;

      await expect(manager.connect(SPARK_40)).resolves.toBe(false);
    });

    it("drops the half-open link so the next attempt starts clean", async () => {
      connection.receiveResult = false;

      await manager.connect(SPARK_40);

      expect(connection.disconnectCalls).toBe(1);
    });

    it("does not poll a receive queue that will never fill", async () => {
      connection.receiveResult = false;
      await manager.connect(SPARK_40);

      const readSpy = vi.spyOn(connection, "readReceiveQueue");
      await vi.advanceTimersByTimeAsync(500);

      expect(readSpy).not.toHaveBeenCalled();
    });

    it("reports a reconnect as failed too", async () => {
      await manager.connect(SPARK_40);
      connection.receiveResult = false;

      await expect(manager.reconnect()).resolves.toBe(false);
      expect(connection.disconnectCalls).toBe(1);
    });

    it("connects normally on a later attempt once notifications work", async () => {
      connection.receiveResult = false;
      await manager.connect(SPARK_40);

      connection.receiveResult = true;

      await expect(manager.connect(SPARK_40)).resolves.toBe(true);
    });
  });

  it("stops polling the receive queue after disconnect", async () => {
    await manager.connect(SPARK_40);
    await manager.disconnect();

    const readSpy = vi.spyOn(connection, "readReceiveQueue");
    await vi.advanceTimersByTimeAsync(500);

    expect(readSpy).not.toHaveBeenCalled();
    expect(connection.disconnectCalls).toBe(1);
  });

  it("polls the receive queue while connected", async () => {
    await manager.connect(SPARK_40);
    const readSpy = vi.spyOn(connection, "readReceiveQueue");

    await vi.advanceTimersByTimeAsync(200);

    expect(readSpy).toHaveBeenCalled();
  });
});
