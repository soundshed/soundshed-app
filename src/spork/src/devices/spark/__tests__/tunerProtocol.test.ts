import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BluetoothDeviceInfo } from "../../../interfaces/deviceController";
import { SerialCommsProvider } from "../../../interfaces/serialCommsProvider";
import { DeviceState } from "../../../interfaces/preset";
import { isTunerMessage, TunerOnOffMessage, TunerOutputMessage } from "../../../interfaces/tuner";
import { SparkCommandMessage } from "../sparkCommandMessage";
import { SparkDeviceManager } from "../sparkDeviceManager";
import { blocksToChunks, decodeBlocks, encodeFloat } from "./protocolTestUtils";

/** Builds an amp -> app tuner reading (0x03 0x64) with the app's own encoder. */
function tunerOutputFrame(note: number, offset: number): Uint8Array[] {
  const msg = new SparkCommandMessage();
  msg.start_message(0x03, 0x64);
  msg.add_bytes(Uint8Array.from([note]));
  msg.add_float(offset);
  return msg.end_message();
}

/** Builds an amp -> app tuner on/off notification (0x03 0x65) with the app's own encoder. */
function tunerOnOffFrame(enabled: boolean): Uint8Array[] {
  const msg = new SparkCommandMessage();
  msg.start_message(0x03, 0x65);
  msg.add_onoff(enabled);
  return msg.end_message();
}

function rawFrame(sub_cmd: number, payload8: number[]): Uint8Array[] {
  const msg = new SparkCommandMessage();
  msg.start_message(0x03, sub_cmd);
  msg.add_bytes(Uint8Array.from(payload8));
  return msg.end_message();
}

describe("switch_tuner (app -> amp 0x01 0x65)", () => {
  it.each([
    [true, 0xc3],
    [false, 0xc2],
  ])("encodes enabled=%s as a single msgpack bool", (enabled, boolByte) => {
    const msg = new SparkCommandMessage();
    const blocks = msg.switch_tuner(enabled);

    expect(blocks).toHaveLength(1);
    expect(Array.from(msg.get_raw_msg())).toEqual([0x01, 0x65, boolByte]);

    const chunk = blocksToChunks(blocks)[0];
    // chunk header, cmd, sub_cmd, then the 7-bit packed bool: the high bit of 0xc3/0xc2
    // travels in the leading bit8 byte.
    expect(Array.from(chunk)).toEqual([0xf0, 0x01, 0x3a, 0x15, 0x01, 0x65, 0x01, boolByte & 0x7f, 0xf7]);
  });

  it("is a single block with a correct length byte", () => {
    const [block] = new SparkCommandMessage().switch_tuner(true);

    expect(block[0]).toBe(0x01);
    expect(block[1]).toBe(0xfe);
    expect(block[6]).toBe(block.length);
  });

  it("sends the same bytes on a Spark 2 (Ignitron adds no trailing byte)", () => {
    const legacy = new SparkCommandMessage().switch_tuner(true);
    const spark2 = new SparkCommandMessage({ spark2: true }).switch_tuner(true);

    expect(Array.from(spark2[0])).toEqual(Array.from(legacy[0]));
  });
});

describe("tuner output (amp -> app 0x03 0x64)", () => {
  it("decodes the note byte and offset float", () => {
    const messages = decodeBlocks(tunerOutputFrame(9, 0.5));

    expect(messages).toHaveLength(1);
    const msg = messages[0] as TunerOutputMessage;
    expect(msg.type).toBe("tuner_output");
    expect(msg.note).toBe(9);
    expect(msg.offset).toBe(0.5);
    expect(isTunerMessage(msg)).toBe(true);
  });

  it.each([
    [0, 0],
    [4, 0.25],
    [11, 0.75],
    [0x0e, 1],
  ])("round-trips note %i with offset %s", (note, offset) => {
    const msg = decodeBlocks(tunerOutputFrame(note, offset))[0] as TunerOutputMessage;

    expect(msg.note).toBe(note);
    expect(msg.offset).toBe(offset);
  });

  it("keeps float32 precision for offsets that are not exactly representable", () => {
    const msg = decodeBlocks(tunerOutputFrame(2, 0.43))[0] as TunerOutputMessage;

    expect(msg.offset).toBeCloseTo(0.43, 6);
  });

  it("decodes several readings delivered in one batch in order", () => {
    const messages = decodeBlocks([
      ...tunerOutputFrame(7, 0.4),
      ...tunerOutputFrame(7, 0.5),
      ...tunerOutputFrame(7, 0.625),
    ]) as TunerOutputMessage[];

    expect(messages.map((m) => m.offset.toFixed(3))).toEqual(["0.400", "0.500", "0.625"]);
  });

  it("ignores a reading that is too short instead of emitting garbage", () => {
    expect(decodeBlocks(rawFrame(0x64, [9, ...encodeFloat(0.5).slice(0, 3)]))).toEqual([]);
  });
});

describe("tuner on/off (amp -> app 0x03 0x65)", () => {
  it.each([true, false])("decodes enabled=%s", (enabled) => {
    const messages = decodeBlocks(tunerOnOffFrame(enabled));

    expect(messages).toHaveLength(1);
    const msg = messages[0] as TunerOnOffMessage;
    expect(msg.type).toBe("tuner_onoff");
    expect(msg.enabled).toBe(enabled);
  });

  it("ignores a value that is not a msgpack bool", () => {
    expect(decodeBlocks(rawFrame(0x65, [0x05]))).toEqual([]);
  });

  it("does not disturb neighbouring messages in the same batch", () => {
    const messages = decodeBlocks([
      ...tunerOnOffFrame(true),
      ...tunerOutputFrame(4, 0.5),
      ...tunerOnOffFrame(false),
    ]);

    expect(messages.map((m) => m.type)).toEqual(["tuner_onoff", "tuner_output", "tuner_onoff"]);
  });
});

class FakeConnection implements SerialCommsProvider {
  public written: Uint8Array[] = [];
  public queue: Uint8Array[] = [];
  public onDisconnected: (() => void) | null = null;

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
  isSpark2Connection(): boolean {
    return false;
  }
}

describe("SparkDeviceManager tuner support", () => {
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

  it.each([true, false])("setTunerEnabled(%s) writes the switch_tuner frame", async (enabled) => {
    await manager.setTunerEnabled(enabled);

    expect(connection.written.map((w) => Array.from(w))).toEqual(
      new SparkCommandMessage().switch_tuner(enabled).map((b) => Array.from(b))
    );
  });

  it("reports tuner messages from the amp through onStateChanged", async () => {
    const seen: DeviceState[] = [];
    manager.onStateChanged = (s: DeviceState) => seen.push({ ...s });

    await manager.readStateMessage(blocksToChunks([...tunerOnOffFrame(true), ...tunerOutputFrame(9, 0.5)]));

    expect(seen.map((s) => s.message?.type)).toEqual(["tuner_onoff", "tuner_output"]);
  });
});
