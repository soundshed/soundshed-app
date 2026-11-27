import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BluetoothDeviceInfo } from "../../../interfaces/deviceController";
import { SerialCommsProvider } from "../../../interfaces/serialCommsProvider";
import { DeviceState } from "../../../interfaces/preset";
import { isMixerMessage, MIXER_CHANNEL } from "../../../interfaces/mixer";
import { SparkCommandMessage } from "../sparkCommandMessage";
import { SparkDeviceManager } from "../sparkDeviceManager";
import { SparkMessageReader } from "../sparkMessageReader";
import { blocksToChunks, decodeBlocks, encodeFloat } from "./protocolTestUtils";

const hex = (bytes: ArrayLike<number>) => Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join(" ");

/** Builds an amp -> app 0x03 message whose 8-bit payload is given, with the app's own encoder. */
function ampFrame(sub_cmd: number, payload8: number[]): Uint8Array[] {
  const msg = new SparkCommandMessage();
  msg.start_message(0x03, sub_cmd);
  msg.add_bytes(Uint8Array.from(payload8));
  return msg.end_message();
}

/** A payload-less chunk (as the amp sends acks); end_message() emits nothing for those. */
function bareChunk(cmd: number, sub_cmd: number): Uint8Array {
  return Uint8Array.from([0xf0, 0x01, 0x3a, 0x15, cmd, sub_cmd, 0xf7]);
}

describe("set_mixer_volume (app -> amp 0x01 0x33)", () => {
  it("encodes channel 5 at 0.25 without a trailing byte", () => {
    const msg = new SparkCommandMessage();
    const blocks = msg.set_mixer_volume(5, 0.25, false);

    expect(blocks).toHaveLength(1);
    expect(hex(msg.get_raw_msg())).toBe("01 33 05 ca 3e 80 00 00");
    expect(hex(blocks[0])).toBe(
      "01 fe 00 00 53 fe 1e 00 00 00 00 00 00 00 00 00 " +
        // chunk header, cmd/sub, bit8 byte (high bits of 0xca and 0x80), 7-bit data, end
        "f0 01 3a 15 01 33 0a 05 4a 3e 00 00 00 f7"
    );
  });

  it("encodes channel 5 at 0.25 with the Spark 2 style trailing 0x00", () => {
    const msg = new SparkCommandMessage();
    const blocks = msg.set_mixer_volume(5, 0.25, true);

    expect(hex(msg.get_raw_msg())).toBe("01 33 05 ca 3e 80 00 00 00");
    expect(hex(blocks[0])).toBe(
      "01 fe 00 00 53 fe 1f 00 00 00 00 00 00 00 00 00 " + "f0 01 3a 15 01 33 0a 05 4a 3e 00 00 00 00 f7"
    );
  });

  it("does not add the trailing byte just because the message is for a Spark 2", () => {
    const legacy = new SparkCommandMessage().set_mixer_volume(0, 0.5, false);
    const spark2 = new SparkCommandMessage({ spark2: true }).set_mixer_volume(0, 0.5, false);

    expect(hex(spark2[0])).toBe(hex(legacy[0]));
  });

  it.each([
    [-0.5, 0],
    [1.7, 1],
    [Infinity, 1],
    [-Infinity, 0],
  ])("clamps %s to %s", (input, clamped) => {
    const msg = new SparkCommandMessage();
    msg.set_mixer_volume(9, input, false);

    expect(hex(msg.get_raw_msg())).toBe(hex([0x01, 0x33, 0x09, ...encodeFloat(clamped)]));
  });

  it.each([-1, 128, 1.5, NaN])("throws for channel %s", (channel) => {
    expect(() => new SparkCommandMessage().set_mixer_volume(channel, 0.5, false)).toThrow(RangeError);
  });

  it("throws for a value that is not a number", () => {
    expect(() => new SparkCommandMessage().set_mixer_volume(0, NaN, false)).toThrow(RangeError);
  });
});

describe("request_mixer_volume (app -> amp 0x02 0x33)", () => {
  it("sends the channel byte", () => {
    const msg = new SparkCommandMessage();
    const blocks = msg.request_mixer_volume(MIXER_CHANNEL.MASTER);

    expect(hex(msg.get_raw_msg())).toBe("02 33 09");
    expect(hex(blocks[0])).toBe("01 fe 00 00 53 fe 19 00 00 00 00 00 00 00 00 00 f0 01 3a 15 02 33 00 09 f7");
  });

  it("throws for an invalid channel", () => {
    expect(() => new SparkCommandMessage().request_mixer_volume(200)).toThrow(RangeError);
  });
});

describe("mixer messages from the amp", () => {
  it("decodes 0x03 0x33 as mixer_volume", () => {
    const messages = decodeBlocks(ampFrame(0x33, encodeFloat(0.7)));

    expect(messages).toHaveLength(1);
    expect(messages[0].type).toBe("mixer_volume");
    expect(messages[0].value).toBeCloseTo(0.7, 6);
    expect((messages[0] as any).channel).toBeUndefined();
    expect(isMixerMessage(messages[0])).toBe(true);
  });

  it("accepts a reply that unexpectedly carries the channel byte", () => {
    const [msg] = decodeBlocks(ampFrame(0x33, [5, ...encodeFloat(0.25)]));

    expect(msg).toEqual({ type: "mixer_volume", value: 0.25, channel: 5 });
  });

  it("decodes 0x03 0x6b as input_volume", () => {
    expect(decodeBlocks(ampFrame(0x6b, encodeFloat(0.5)))).toEqual([{ type: "input_volume", value: 0.5 }]);
  });

  it("reports a 0x04 0x33 ack as mixer_ack, and other acks not at all", () => {
    const reader = new SparkMessageReader();
    reader.set_message([bareChunk(0x04, 0x33), bareChunk(0x04, 0x15), bareChunk(0x05, 0x33)]);
    reader.read_message();

    expect(reader.readMessageQueue()).toEqual([
      { type: "mixer_ack", value: true },
      { type: "mixer_ack", value: true },
    ]);
    expect(SparkMessageReader.getAckMessage(0x33)).toBe("Acknowledgement: Mixer Volume");
  });

  it.each([
    ["an empty 0x03 0x33", 0x33, []],
    ["a truncated float", 0x33, encodeFloat(0.5).slice(0, 3)],
    ["a non-float byte", 0x33, [0x05]],
    ["an empty 0x03 0x6b", 0x6b, []],
    ["a truncated 0x03 0x6b", 0x6b, [0xca, 0x3f]],
    ["a 0x03 0x6b that is not a float", 0x6b, [0xc3, 0, 0, 0, 0]],
  ])("ignores %s without throwing", (_name, sub, payload) => {
    const reader = new SparkMessageReader();
    const frames = payload.length ? blocksToChunks(ampFrame(sub as number, payload as number[])) : [bareChunk(0x03, sub as number)];
    reader.set_message(frames);

    expect(() => reader.read_message()).not.toThrow();
    expect(reader.readMessageQueue()).toEqual([]);
  });

  it("does not disturb neighbouring messages in the same batch", () => {
    const messages = decodeBlocks([
      ...ampFrame(0x33, encodeFloat(0.5)),
      ...ampFrame(0x33, [0x05]),
      ...ampFrame(0x6b, encodeFloat(0.25)),
    ]);

    expect(messages.map((m) => m.type)).toEqual(["mixer_volume", "input_volume"]);
  });
});

class FakeConnection implements SerialCommsProvider {
  public written: Uint8Array[] = [];
  public onDisconnected: (() => void) | null = null;
  public spark2 = false;

  async disconnect(): Promise<void> {}
  async connect(_device: BluetoothDeviceInfo): Promise<boolean> {
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
    return this.spark2;
  }
}

describe("SparkDeviceManager mixer support", () => {
  let connection: FakeConnection;
  let manager: SparkDeviceManager;
  const written = () => connection.written.map((w) => hex(w));
  const frames = (blocks: Uint8Array[]) => blocks.map((b) => hex(b));

  beforeEach(() => {
    vi.useFakeTimers();
    connection = new FakeConnection();
    manager = new SparkDeviceManager(connection);
  });

  afterEach(async () => {
    await manager.disconnect();
    vi.useRealTimers();
  });

  it("setMixerVolume writes the frame without a trailing byte on a Spark 40", async () => {
    await manager.connect({ name: "Spark 40 Audio", address: "a", port: null });

    await expect(manager.setMixerVolume(5, 0.25)).resolves.toBe(true);

    expect(written()).toEqual(frames(new SparkCommandMessage().set_mixer_volume(5, 0.25, false)));
  });

  it("setMixerVolume follows the model by default: trailing 0x00 on a Spark 2", async () => {
    await manager.connect({ name: "Spark 2", address: "a", port: null });

    await manager.setMixerVolume(5, 0.25);
    await manager.setMixerVolume(5, 0.25, false);

    expect(written()).toEqual([
      ...frames(new SparkCommandMessage().set_mixer_volume(5, 0.25, true)),
      ...frames(new SparkCommandMessage().set_mixer_volume(5, 0.25, false)),
    ]);
  });

  it("requestMixerVolume writes the request frame", async () => {
    await expect(manager.requestMixerVolume(9)).resolves.toBe(true);

    expect(written()).toEqual(frames(new SparkCommandMessage().request_mixer_volume(9)));
  });

  it("resolves false for an invalid channel or a failed write", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    await expect(manager.setMixerVolume(300, 0.5)).resolves.toBe(false);
    connection.write = async () => {
      throw new Error("GATT write failed");
    };
    await expect(manager.requestMixerVolume(0)).resolves.toBe(false);

    warn.mockRestore();
  });

  it("is queued behind commands already in flight", async () => {
    const first = manager.sendCommand("get_device_serial", {});
    const mixer = manager.setMixerVolume(0, 0.5, false);
    await Promise.all([first, mixer]);

    expect(written()).toEqual([
      ...frames(new SparkCommandMessage().request_info(0x23)),
      ...frames(new SparkCommandMessage().set_mixer_volume(0, 0.5, false)),
    ]);
  });

  it("also takes set_mixer_volume / get_mixer_volume through sendCommand", async () => {
    await manager.sendCommand("set_mixer_volume", { channel: 9, value: 0.1, trailingZero: true });
    await manager.sendCommand("get_mixer_volume", 9);

    expect(written()).toEqual([
      ...frames(new SparkCommandMessage().set_mixer_volume(9, 0.1, true)),
      ...frames(new SparkCommandMessage().request_mixer_volume(9)),
    ]);
  });

  it("reports mixer messages from the amp through onStateChanged", async () => {
    const seen: DeviceState[] = [];
    manager.onStateChanged = (s: DeviceState) => seen.push({ ...s });

    await manager.readStateMessage([
      ...blocksToChunks(ampFrame(0x33, encodeFloat(0.5))),
      bareChunk(0x04, 0x33),
      ...blocksToChunks(ampFrame(0x6b, encodeFloat(0.4))),
    ]);

    expect(seen.map((s) => s.message?.type)).toEqual(["mixer_volume", "mixer_ack", "input_volume"]);
  });
});
