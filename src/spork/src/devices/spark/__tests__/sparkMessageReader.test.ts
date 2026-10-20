import { describe, expect, it } from "vitest";
import { SparkMessageReader } from "../sparkMessageReader";
import {
  encodeFloat,
  encodePrefixedString,
  encodeShortString,
} from "./protocolTestUtils";

function readerFor(bytes: number[]): SparkMessageReader {
  const reader = new SparkMessageReader();
  reader.set_interpreter(new Uint8Array(bytes));
  return reader;
}

describe("SparkMessageReader.mergeBytes", () => {
  it("concatenates typed arrays in order", () => {
    const merged = SparkMessageReader.mergeBytes(
      Uint8Array.from([0x01, 0x02]),
      Uint8Array.from([0x03]),
      Uint8Array.from([0x04, 0x05])
    );

    expect(Array.from(merged)).toEqual([0x01, 0x02, 0x03, 0x04, 0x05]);
  });

  it("returns an empty array when given no content", () => {
    expect(SparkMessageReader.mergeBytes().length).toBe(0);
  });

  it("preserves bytes with the high bit set", () => {
    const merged = SparkMessageReader.mergeBytes(
      Uint8Array.from([0xf0]),
      Uint8Array.from([0xff, 0x80])
    );

    expect(Array.from(merged)).toEqual([0xf0, 0xff, 0x80]);
  });
});

describe("read_float", () => {
  it.each([0, 0.5, 0.25, 1, 120, -0.5, 0.125])(
    "round-trips the exactly-representable value %s",
    (value) => {
      expect(readerFor(encodeFloat(value)).read_float()).toBe(value);
    }
  );

  it("decodes a float32 that is not exactly representable in binary", () => {
    expect(readerFor(encodeFloat(0.3)).read_float()).toBeCloseTo(0.3, 6);
  });

  it("advances the cursor by five bytes (prefix plus four data bytes)", () => {
    const reader = readerFor([...encodeFloat(0.5), 0xab]);

    reader.read_float();

    expect(reader.read_byte()).toBe(0xab);
  });
});

describe("read_string", () => {
  it("decodes a short fixstr", () => {
    expect(readerFor(encodeShortString("Booster")).read_string()).toBe(
      "Booster"
    );
  });

  it("decodes an empty fixstr", () => {
    expect(readerFor([0xa0]).read_string()).toBe("");
  });

  it("decodes a 0xd9-prefixed long string", () => {
    const value = "A description that is longer than thirty-one characters";
    const encoded = [
      0xd9,
      value.length,
      ...Array.from(new TextEncoder().encode(value)),
    ];

    expect(readerFor(encoded).read_string()).toBe(value);
  });

  it("replaces non-printable bytes with spaces", () => {
    // 0x00 and 0x7f fall outside the printable range the reader allows.
    expect(readerFor([0xa3, 0x41, 0x00, 0x7f]).read_string()).toBe("A  ");
  });
});

describe("read_prefixed_string", () => {
  it("decodes a length-prefixed fixstr", () => {
    expect(
      readerFor(encodePrefixedString("bias.reverb")).read_prefixed_string()
    ).toBe("bias.reverb");
  });
});

describe("read_onoff", () => {
  it("maps 0xc3 to On and 0xc2 to Off", () => {
    expect(readerFor([0xc3]).read_onoff()).toBe("On");
    expect(readerFor([0xc2]).read_onoff()).toBe("Off");
  });

  it("returns ? for an unrecognised value rather than throwing", () => {
    expect(readerFor([0x00]).read_onoff()).toBe("?");
  });
});

describe("is_string_prefix", () => {
  it("accepts the fixstr range and the 0xd9 long-string marker", () => {
    const reader = new SparkMessageReader();

    expect(reader.is_string_prefix(0xd9)).toBe(true);
    expect(reader.is_string_prefix(0xa0)).toBe(true);
    expect(reader.is_string_prefix(0xbf)).toBe(true);
  });

  it("rejects markers used by other msgpack types", () => {
    const reader = new SparkMessageReader();

    expect(reader.is_string_prefix(0xca)).toBe(false); // float
    expect(reader.is_string_prefix(0xc3)).toBe(false); // true/On
    expect(reader.is_string_prefix(0x97)).toBe(false); // fixarray
    expect(reader.is_string_prefix(0x9f)).toBe(false);
  });
});

describe("has_remaining_bytes", () => {
  it("reports whether the requested count is still available", () => {
    const reader = readerFor([0x01, 0x02]);

    expect(reader.has_remaining_bytes(2)).toBe(true);
    expect(reader.has_remaining_bytes(3)).toBe(false);

    reader.read_byte();
    reader.read_byte();

    expect(reader.has_remaining_bytes()).toBe(false);
  });
});

describe("peek_byte", () => {
  it("reads ahead without consuming", () => {
    const reader = readerFor([0x10, 0x20, 0x30]);

    expect(reader.peek_byte()).toBe(0x10);
    expect(reader.peek_byte(2)).toBe(0x30);
    expect(reader.read_byte()).toBe(0x10);
  });
});

describe("getAckMessage", () => {
  it.each([
    [0x01, "Preset Chunk"],
    [0x05, "Preset Final Chunk"],
    [0x06, "Changed Amp Model"],
    [0x15, "Turn FX On/Off"],
    [0x38, "Changed Preset Number"],
    [0x70, "License Key"],
  ])("describes ack sub-command 0x%s", (subCmd, expected) => {
    expect(SparkMessageReader.getAckMessage(subCmd)).toBe(
      "Acknowledgement: " + expected
    );
  });

  it("falls back to the bare prefix for an unknown sub-command", () => {
    expect(SparkMessageReader.getAckMessage(0xee)).toBe("Acknowledgement: ");
  });
});

describe("readMessageQueue", () => {
  it("drains the queue so messages are not delivered twice", () => {
    const reader = new SparkMessageReader();
    reader.receivedMessageQueue.push({ type: "preset", value: 1 });

    expect(reader.readMessageQueue()).toHaveLength(1);
    expect(reader.readMessageQueue()).toHaveLength(0);
  });

  it("returns a copy that is unaffected by later pushes", () => {
    const reader = new SparkMessageReader();
    reader.receivedMessageQueue.push({ type: "preset", value: 1 });

    const drained = reader.readMessageQueue();
    reader.receivedMessageQueue.push({ type: "preset", value: 2 });

    expect(drained).toHaveLength(1);
  });
});
