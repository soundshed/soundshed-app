import { DeviceMessage } from "../../../interfaces/preset";
import { SparkMessageReader } from "../sparkMessageReader";

/**
 * Strips the 16-byte transport block header from each frame, mirroring
 * TcpProvider.trimHeader(). SparkMessageReader expects chunk payloads that
 * start at 0xF0, which is what both the BLE and TCP transports hand it.
 */
export function blocksToChunks(blocks: Uint8Array[]): Uint8Array[] {
  return blocks.map((b) =>
    b.length > 16 && b[0] === 0x01 && b[1] === 0xfe ? b.subarray(16) : b
  );
}

/** Encodes -> transport-normalises -> decodes, returning the parsed messages. */
export function decodeBlocks(blocks: Uint8Array[]): DeviceMessage[] {
  const reader = new SparkMessageReader();
  reader.set_message(blocksToChunks(blocks));
  reader.read_message();
  return reader.readMessageQueue();
}

/** Same as decodeBlocks but also exposes the reader for deviceState assertions. */
export function decodeWithReader(blocks: Uint8Array[]): {
  messages: DeviceMessage[];
  reader: SparkMessageReader;
} {
  const reader = new SparkMessageReader();
  reader.set_message(blocksToChunks(blocks));
  reader.read_message();
  return { messages: reader.readMessageQueue(), reader };
}

/** msgpack float32: 0xca followed by 4 big-endian bytes. */
export function encodeFloat(value: number): number[] {
  const f = new Float32Array(1);
  f[0] = value;
  return [0xca, ...Array.from(new Uint8Array(f.buffer).reverse())];
}

/** msgpack fixstr: 0xa0 + length, then the ASCII bytes. */
export function encodeShortString(value: string): number[] {
  return [0xa0 + value.length, ...Array.from(new TextEncoder().encode(value))];
}

/** The reader's "prefixed string" form: raw length byte, then a fixstr. */
export function encodePrefixedString(value: string): number[] {
  return [value.length, ...encodeShortString(value)];
}

/** Builds a preset object in the shape SparkCommandMessage.create_preset expects. */
export function buildTestPreset(overrides: Partial<Record<string, any>> = {}) {
  const pedal = (name: string, onOff: string, params: number[]) => ({
    Name: name,
    OnOff: onOff,
    Parameters: params,
  });

  return {
    UUID: "F39EE160-DE10-4646-8257-79178B688B62",
    Name: "Test Tone",
    Version: "0.7",
    Description: "A tone used by the protocol tests",
    Icon: "icon.png",
    Pedals: [
      pedal("bias.noisegate", "On", [0.5, 0.25]),
      pedal("Compressor", "Off", [0.25, 0.75]),
      pedal("Booster", "On", [0.5]),
      pedal("RolandJC120", "On", [0.5, 0.25, 0.75, 0.125, 1.0]),
      pedal("Cloner", "Off", [0.5, 0.25]),
      pedal("VintageDelay", "On", [0.25, 0.5, 0.75, 0.125]),
      pedal("bias.reverb", "On", [0.5, 0.25, 0.75, 0.125, 0.625, 0.375, 0.5]),
    ],
    ...overrides,
  };
}
