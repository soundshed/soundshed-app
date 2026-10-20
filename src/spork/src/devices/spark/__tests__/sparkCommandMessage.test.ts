import { describe, expect, it } from "vitest";
import { SparkCommandMessage } from "../sparkCommandMessage";
import { blocksToChunks, buildTestPreset } from "./protocolTestUtils";

const BLOCK_HEADER = [0x01, 0xfe, 0x00, 0x00, 0x53, 0xfe];
const CHUNK_HEADER = [0xf0, 0x01, 0x3a, 0x15];

/** Payload of a chunk: everything between the sub-command byte and the 0xf7 terminator. */
function payloadOf(block: Uint8Array): Uint8Array {
  const chunk = blocksToChunks([block])[0];
  return chunk.subarray(6, chunk.length - 1);
}

describe("block framing", () => {
  const blocks = new SparkCommandMessage().change_hardware_preset(2);

  it("emits a single block for a small command", () => {
    expect(blocks).toHaveLength(1);
  });

  it("starts each block with the transport header", () => {
    expect(Array.from(blocks[0].subarray(0, 6))).toEqual(BLOCK_HEADER);
  });

  it("places the chunk header at offset 16, immediately after the block header", () => {
    expect(Array.from(blocks[0].subarray(16, 20))).toEqual(CHUNK_HEADER);
  });

  it("writes the command and sub-command where the transports expect them", () => {
    const chunk = blocksToChunks(blocks)[0];

    // TcpProvider/BleProvider read cmd at chunk[4] and sub_cmd at chunk[5].
    expect(chunk[4]).toBe(0x01);
    expect(chunk[5]).toBe(0x38);
  });

  it("declares its own length in the size byte", () => {
    expect(blocks[0][6]).toBe(blocks[0].length);
  });

  it("terminates the block with 0xf7", () => {
    expect(blocks[0][blocks[0].length - 1]).toBe(0xf7);
  });
});

describe("7-bit payload encoding", () => {
  it("never emits a payload byte with the high bit set", () => {
    // 0xf7 is the frame terminator, so a raw 0x80+ byte leaking into the
    // payload would corrupt framing for everything downstream.
    const blocks = new SparkCommandMessage().create_preset(buildTestPreset());

    for (const block of blocks) {
      for (const byte of payloadOf(block)) {
        expect(byte).toBeLessThan(0x80);
      }
    }
  });

  it("groups payload data into 8-byte sequences (one mask byte plus seven data bytes)", () => {
    // change_hardware_preset writes exactly two data bytes, so one sequence.
    const blocks = new SparkCommandMessage().change_hardware_preset(3);

    expect(Array.from(payloadOf(blocks[0]))).toEqual([0x00, 0x00, 0x03]);
  });

  it("records high bits of a float in the leading mask byte", () => {
    // 120.0 as float32 big-endian is 42 f0 00 00; 0xf0 has its high bit set.
    const msg = new SparkCommandMessage();
    msg.start_message(0x01, 0x04);
    msg.add_float(120.0);
    const payload = payloadOf(msg.end_message()[0]);

    // Data is 0xca 0x42 0xf0 0x00 0x00 -> mask, then the 7-bit values.
    expect(payload[0]).toBe(0b00000101); // bytes 0 (0xca) and 2 (0xf0) are high
    expect(Array.from(payload.subarray(1))).toEqual([0x4a, 0x42, 0x70, 0x00, 0x00]);
  });

  it.each([4, 5, 6, 7, 8, 13, 14, 15, 20, 21, 22])(
    "emits no padding sequence for an effect name of length %i",
    (nameLength) => {
      // Payload is one mask byte per (up to) seven data bytes. When the data
      // length is an exact multiple of seven, an off-by-one in the sequence
      // count appends a stray mask byte, so check the size exactly.
      const msg = new SparkCommandMessage();
      msg.start_message(0x01, 0x04);
      msg.add_prefixed_string("x".repeat(nameLength));
      msg.add_bytes(Uint8Array.from([0]));
      msg.add_float(0.5);

      const dataLength = msg.get_raw_msg().length - 2; // minus cmd and sub_cmd
      const payload = payloadOf(msg.end_message()[0]);

      expect(payload.length).toBe(dataLength + Math.ceil(dataLength / 7));
    }
  );
});

describe("msgpack value packing", () => {
  function rawDataFor(fn: (m: SparkCommandMessage) => void): number[] {
    const msg = new SparkCommandMessage();
    msg.start_message(0x01, 0x01);
    fn(msg);
    // get_raw_msg prepends cmd and sub_cmd.
    return Array.from(msg.get_raw_msg()).slice(2);
  }

  it("packs a short string as 0xa0 + length", () => {
    expect(rawDataFor((m) => m.add_string("Booster"))).toEqual([
      0xa7, 0x42, 0x6f, 0x6f, 0x73, 0x74, 0x65, 0x72,
    ]);
  });

  it("packs a long string with the 0xd9 marker and an explicit length", () => {
    const value = "x".repeat(40);
    const packed = rawDataFor((m) => m.add_long_string(value));

    expect(packed[0]).toBe(0xd9);
    expect(packed[1]).toBe(40);
    expect(packed).toHaveLength(42);
  });

  it("packs a prefixed string as a bare length followed by a fixstr", () => {
    expect(rawDataFor((m) => m.add_prefixed_string("Amp"))).toEqual([
      0x03, 0xa3, 0x41, 0x6d, 0x70,
    ]);
  });

  it("packs a float as 0xca plus four big-endian bytes", () => {
    expect(rawDataFor((m) => m.add_float(0.5))).toEqual([
      0xca, 0x3f, 0x00, 0x00, 0x00,
    ]);
  });

  it("packs on/off as 0xc3 and 0xc2 for both string and boolean input", () => {
    expect(rawDataFor((m) => m.add_onoff("On"))).toEqual([0xc3]);
    expect(rawDataFor((m) => m.add_onoff("Off"))).toEqual([0xc2]);
    expect(rawDataFor((m) => m.add_onoff(true))).toEqual([0xc3]);
    expect(rawDataFor((m) => m.add_onoff(false))).toEqual([0xc2]);
  });
});

describe("command and sub-command selection", () => {
  it.each([
    ["change_hardware_preset", (m: SparkCommandMessage) => m.change_hardware_preset(1), 0x01, 0x38],
    ["change_effect", (m: SparkCommandMessage) => m.change_effect("a", "b"), 0x01, 0x06],
    ["change_effect_parameter", (m: SparkCommandMessage) => m.change_effect_parameter("a", 1, 0.5), 0x01, 0x04],
    ["turn_effect_onoff", (m: SparkCommandMessage) => m.turn_effect_onoff("a", "On"), 0x01, 0x15],
    ["change_amp", (m: SparkCommandMessage) => m.change_amp("a", "b"), 0x03, 0x06],
    ["change_amp_parameter", (m: SparkCommandMessage) => m.change_amp_parameter("a", 1, 0.5), 0x03, 0x37],
    ["store_current_preset", (m: SparkCommandMessage) => m.store_current_preset(2), 0x03, 0x27],
    ["request_preset_state", (m: SparkCommandMessage) => m.request_preset_state(1), 0x02, 0x01],
  ])("%s uses cmd 0x%s sub 0x%s", (_name, build, cmd, subCmd) => {
    const chunk = blocksToChunks(build(new SparkCommandMessage()))[0];

    expect(chunk[4]).toBe(cmd);
    expect(chunk[5]).toBe(subCmd);
  });

  it("request_info forwards the requested info type as the sub-command", () => {
    for (const infoType of [0x10, 0x11, 0x23]) {
      const chunk = blocksToChunks(new SparkCommandMessage().request_info(infoType))[0];

      expect(chunk[4]).toBe(0x02);
      expect(chunk[5]).toBe(infoType);
    }
  });
});

describe("Spark 2 behaviour", () => {
  it("appends a trailing null to effect commands only when Spark 2 is enabled", () => {
    const spark40 = new SparkCommandMessage({ spark2: false });
    const spark2 = new SparkCommandMessage({ spark2: true });

    const base = Array.from(spark40.get_raw_msg());
    spark40.change_effect("a", "b");
    spark2.change_effect("a", "b");

    expect(spark2.get_raw_msg().length).toBe(spark40.get_raw_msg().length + 1);
    expect(spark2.get_raw_msg()[spark2.get_raw_msg().length - 1]).toBe(0x00);
    expect(base).toBeDefined();
  });

  it("sends live sync as a single raw block on Spark 2", () => {
    const blocks = new SparkCommandMessage({ spark2: true }).request_live_sync();
    const chunk = blocksToChunks(blocks)[0];

    expect(blocks).toHaveLength(1);
    expect(chunk[4]).toBe(0x02);
    expect(chunk[5]).toBe(0x1a);
    // Raw path: payload is written verbatim, not 7-bit encoded.
    expect(Array.from(chunk.subarray(6, chunk.length - 1))).toEqual([
      0x01, 0x12, 0x00, 0x01,
    ]);
  });

  it("7-bit encodes live sync on Spark 40", () => {
    const blocks = new SparkCommandMessage({ spark2: false }).request_live_sync();
    const payload = payloadOf(blocks[0]);

    // Same four data bytes, but preceded by the high-bit mask byte.
    expect(Array.from(payload)).toEqual([0x00, 0x01, 0x12, 0x00, 0x01]);
  });
});

describe("multi-chunk splitting", () => {
  it("splits a full preset into several blocks", () => {
    const blocks = new SparkCommandMessage().create_preset(buildTestPreset());

    expect(blocks.length).toBeGreaterThan(1);
  });

  it("numbers each chunk and reports the total in the sub-header", () => {
    const blocks = new SparkCommandMessage().create_preset(buildTestPreset());
    const chunks = blocksToChunks(blocks);

    chunks.forEach((chunk, index) => {
      // First payload byte is the mask; the sub-header follows it.
      const payload = chunk.subarray(6, chunk.length - 1);
      expect(payload[1]).toBe(blocks.length); // num_chunks
      expect(payload[2]).toBe(index); // this_chunk
    });
  });

  it("keeps every block within the Spark block size limit", () => {
    const blocks = new SparkCommandMessage().create_preset(buildTestPreset());

    for (const block of blocks) {
      expect(block.length).toBeLessThanOrEqual(0xc0);
    }
  });
});
