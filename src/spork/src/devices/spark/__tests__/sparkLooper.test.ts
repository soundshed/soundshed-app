import { describe, expect, it } from "vitest";
import { BpmMessage } from "../../../interfaces/preset";
import { SerialCommsProvider } from "../../../interfaces/serialCommsProvider";
import { SparkCommandMessage } from "../sparkCommandMessage";
import { SparkDeviceManager } from "../sparkDeviceManager";
import {
  DEFAULT_LOOPER_SETTINGS,
  encodeLooperSettingsPayload,
  isLooperMessage,
  LooperCommand,
  LooperCommandMessage,
  LooperMeasureMessage,
  looperCommandName,
  LooperSettings,
  LooperSettingsMessage,
  LooperStatusMessage,
  normaliseLooperSettings,
} from "../sparkLooper";
import { decodeBlocks, encodeFloat } from "./protocolTestUtils";

const HEADER = [0x01, 0xfe, 0x00, 0x00, 0x53, 0xfe];
const FILLER = [0, 0, 0, 0, 0, 0, 0, 0, 0];
const CHUNK = [0xf0, 0x01, 0x3a, 0x15];

/** A complete single block frame for an already 7-bit packed payload. */
function frame(cmd: number, subCmd: number, packed: number[]): number[] {
  return [...HEADER, packed.length + 23, ...FILLER, ...CHUNK, cmd, subCmd, ...packed, 0xf7];
}

/** Builds an amp -> app (0x03) message the way the amp frames it. */
function ampMessage(subCmd: number, payload: number[]): Uint8Array[] {
  const msg = new SparkCommandMessage();
  msg.start_message(0x03, subCmd);
  msg.add_bytes(Uint8Array.from(payload));
  return msg.end_message();
}

function rawPayload(build: (m: SparkCommandMessage) => Uint8Array[]): number[] {
  const m = new SparkCommandMessage();
  build(m);
  return Array.from(m.get_raw_msg());
}

const settings = (overrides: Partial<LooperSettings> = {}): LooperSettings => ({
  ...DEFAULT_LOOPER_SETTINGS,
  ...overrides,
});

describe("looper transport command (0x01 0x75)", () => {
  it("frames Play as a single 7-bit packed command byte", () => {
    const blocks = new SparkCommandMessage().looper_command(LooperCommand.Play);

    expect(blocks).toHaveLength(1);
    expect(Array.from(blocks[0])).toEqual(frame(0x01, 0x75, [0x00, 0x08]));
  });

  it.each([
    [LooperCommand.CountIn, 0x02],
    [LooperCommand.Record, 0x04],
    [LooperCommand.StopRecord, 0x05],
    [LooperCommand.Retry, 0x06],
    [LooperCommand.RecordComplete, 0x07],
    [LooperCommand.Play, 0x08],
    [LooperCommand.Stop, 0x09],
    [LooperCommand.Delete, 0x0a],
    [LooperCommand.Dub, 0x0b],
    [LooperCommand.StopDub, 0x0c],
    [LooperCommand.Undo, 0x0d],
    [LooperCommand.Redo, 0x0e],
  ])("encodes command %i as byte 0x%s", (command, byte) => {
    expect(rawPayload((m) => m.looper_command(command))).toEqual([0x01, 0x75, byte]);
  });

  it("is identical for Spark 2 framing", () => {
    expect(
      Array.from(new SparkCommandMessage({ spark2: true }).looper_command(LooperCommand.Dub)[0])
    ).toEqual(Array.from(new SparkCommandMessage().looper_command(LooperCommand.Dub)[0]));
  });
});

describe("looper settings (0x01 0x76)", () => {
  it("encodes the default settings like Ignitron's updateLooperSettings", () => {
    expect(encodeLooperSettingsPayload(settings())).toEqual([
      0x78, // 120 bpm
      0x04, // straight
      0x04, // 4 bars
      0xc2, // free off
      0xc3, // click on
      0xc2, // unknown off
      0xcd, 0xea, 0x60, // 60000 ms
    ]);
  });

  it("prefixes a bpm of 128 or more with 0xCC", () => {
    expect(encodeLooperSettingsPayload(settings({ bpm: 128 })).slice(0, 2)).toEqual([0xcc, 0x80]);
    expect(encodeLooperSettingsPayload(settings({ bpm: 200 })).slice(0, 3)).toEqual([0xcc, 0xc8, 0x04]);
  });

  it("does not prefix a bpm of 127", () => {
    expect(encodeLooperSettingsPayload(settings({ bpm: 127 }))[0]).toBe(0x7f);
  });

  it("encodes the on/off switches and shuffle count", () => {
    const payload = encodeLooperSettingsPayload(
      settings({ count: 0x03, bars: 8, free: true, click: false, unknownOnOff: true, maxDuration: 0x0102 })
    );
    expect(payload).toEqual([0x78, 0x03, 0x08, 0xc3, 0xc2, 0xc3, 0xcd, 0x01, 0x02]);
  });

  it("builds the full message with the command and sub-command", () => {
    expect(rawPayload((m) => m.update_looper_settings(settings({ bpm: 140 })))).toEqual([
      0x01, 0x76, 0xcc, 0x8c, 0x04, 0x04, 0xc2, 0xc3, 0xc2, 0xcd, 0xea, 0x60,
    ]);
  });

  it("packs the high bits of a bpm >= 128 into the 7-bit header byte", () => {
    const block = Array.from(new SparkCommandMessage().update_looper_settings(settings({ bpm: 140 }))[0]);
    // first 7-byte group: cc 8c 04 04 c2 c3 c2 -> high bits on bytes 0,1,4,5,6
    expect(block.slice(22, 30)).toEqual([0x73, 0x4c, 0x0c, 0x04, 0x04, 0x42, 0x43, 0x42]);
  });

  it("clamps values the wire format cannot carry", () => {
    expect(normaliseLooperSettings({ bpm: 400, maxDuration: 1e6 })).toMatchObject({ bpm: 255, maxDuration: 0xffff });
    expect(normaliseLooperSettings({ bpm: 5 }).bpm).toBe(30);
    expect(normaliseLooperSettings({ bpm: NaN }).bpm).toBe(120);
  });
});

describe("looper queries (0x02 0x75 / 0x76 / 0x78)", () => {
  it.each([
    ["request_looper_record_status", 0x75],
    ["request_looper_settings", 0x76],
    ["request_looper_status", 0x78],
  ] as const)("%s sends an empty 0x02 0x%s frame", (method, subCmd) => {
    const blocks = (new SparkCommandMessage() as any)[method]() as Uint8Array[];

    expect(blocks).toHaveLength(1);
    expect(Array.from(blocks[0])).toEqual(frame(0x02, subCmd, []));
    expect(blocks[0][6]).toBe(0x17);
  });
});

describe("reading looper messages (0x03 0x75 - 0x78)", () => {
  it("reads the transport command the amp executed", () => {
    const messages = decodeBlocks(ampMessage(0x75, [0x0b]));

    expect(messages).toEqual([{ type: "looper_command", command: LooperCommand.Dub }]);
    expect(isLooperMessage(messages[0])).toBe(true);
  });

  it("reads looper settings", () => {
    const messages = decodeBlocks(
      ampMessage(0x76, [0x5a, 0x03, 0x08, 0xc2, 0xc3, 0xc2, 0xcd, 0xea, 0x60])
    );

    expect(messages).toHaveLength(1);
    expect((messages[0] as LooperSettingsMessage).settings).toEqual({
      bpm: 90,
      count: 0x03,
      bars: 8,
      free: false,
      click: true,
      unknownOnOff: false,
      maxDuration: 60000,
    });
  });

  it("reads a bpm >= 128 behind the 0xCC prefix", () => {
    const messages = decodeBlocks(
      ampMessage(0x76, [0xcc, 0xb4, 0x04, 0x04, 0xc3, 0xc2, 0xc3, 0xcd, 0x27, 0x10])
    );

    expect((messages[0] as LooperSettingsMessage).settings).toEqual({
      bpm: 180,
      count: 0x04,
      bars: 4,
      free: true,
      click: false,
      unknownOnOff: true,
      maxDuration: 10000,
    });
  });

  it.each([30, 60, 127, 128, 140, 200, 255])(
    "round-trips settings with %i bpm through the encoder and reader",
    (bpm) => {
      const sent = settings({ bpm, bars: 12, click: bpm % 2 == 0 });
      const messages = decodeBlocks(ampMessage(0x76, encodeLooperSettingsPayload(sent)));

      expect((messages[0] as LooperSettingsMessage).settings).toEqual(sent);
    }
  );

  it("reads the loop position as a float", () => {
    const messages = decodeBlocks(ampMessage(0x77, encodeFloat(0.25)));

    expect(messages).toEqual([{ type: "looper_measure", measure: 0.25 }]);
    expect((messages[0] as LooperMeasureMessage).measure).toBe(0.25);
  });

  it("reads the looper status (Ignitron sample 4C0404004242)", () => {
    const messages = decodeBlocks(ampMessage(0x78, [0x4c, 0x04, 0x04, 0x00, 0x42, 0x42]));

    expect((messages[0] as LooperStatusMessage).status).toEqual({
      bpm: 76,
      count: 4,
      bars: 4,
      loopCount: 0,
      unknown1: 0x42,
      unknown2: 0x42,
    });
  });

  it("reads a status bpm >= 128 behind the 0xCC prefix", () => {
    const messages = decodeBlocks(ampMessage(0x78, [0xcc, 0x96, 0x04, 0x02, 0x03, 0x00, 0x00]));

    expect((messages[0] as LooperStatusMessage).status).toMatchObject({ bpm: 150, bars: 2, loopCount: 3 });
  });

  it("ignores truncated looper messages instead of reading past the end", () => {
    expect(decodeBlocks(ampMessage(0x76, [0x78, 0x04, 0x04]))).toEqual([]);
    expect(decodeBlocks(ampMessage(0x77, [0xca, 0x00]))).toEqual([]);
    expect(decodeBlocks(ampMessage(0x78, [0x78, 0x04]))).toEqual([]);
  });

  it("still reads the amp tempo through the existing 0x03 0x63 handler", () => {
    const messages = decodeBlocks(ampMessage(0x63, encodeFloat(96)));

    expect(messages[0].type).toBe("hardware_bpm");
    expect((messages[0] as BpmMessage).bpm).toBe(96);
    expect(isLooperMessage(messages[0])).toBe(false);
  });

  it("decodes several looper messages from one batch in order", () => {
    const messages = decodeBlocks([
      ...ampMessage(0x75, [LooperCommand.Record]),
      ...ampMessage(0x77, encodeFloat(0.5)),
    ]);

    expect(messages.map((m) => m.type)).toEqual(["looper_command", "looper_measure"]);
    expect((messages[0] as LooperCommandMessage).command).toBe(LooperCommand.Record);
  });
});

describe("looperCommandName", () => {
  it("names known commands and shows unknown ones in hex", () => {
    expect(looperCommandName(LooperCommand.StopDub)).toBe("Stop dub");
    expect(looperCommandName(0x42)).toBe("Unknown (0x42)");
  });
});

describe("SparkDeviceManager looper commands", () => {
  const makeManager = () => {
    const written: number[][] = [];
    const connection = {
      write: async (buffer: Uint8Array) => {
        written.push(Array.from(new Uint8Array(buffer)));
      },
    } as unknown as SerialCommsProvider;
    return { manager: new SparkDeviceManager(connection), written };
  };

  it("writes a transport command", async () => {
    const { manager, written } = makeManager();

    await manager.sendLooperCommand(LooperCommand.Undo);

    expect(written).toEqual([frame(0x01, 0x75, [0x00, 0x0d])]);
  });

  it("writes looper settings", async () => {
    const { manager, written } = makeManager();

    await manager.updateLooperSettings(settings({ bpm: 128 }));

    expect(written).toEqual(
      Array.from(new SparkCommandMessage().update_looper_settings(settings({ bpm: 128 }))).map((b) => Array.from(b))
    );
  });

  it("requests settings, status and record status", async () => {
    const { manager, written } = makeManager();

    await manager.requestLooperState();

    expect(written.map((w) => [w[20], w[21]])).toEqual([
      [0x02, 0x76],
      [0x02, 0x78],
      [0x02, 0x75],
    ]);
  });

  it("queues looper writes behind other commands", async () => {
    const { manager, written } = makeManager();

    const first = manager.sendCommand("set_channel", 1);
    const second = manager.sendLooperCommand(LooperCommand.Play);
    await Promise.all([first, second]);

    expect(written.map((w) => w[21])).toEqual([0x38, 0x75]);
  });

  it("rejects when the write fails so callers can report it", async () => {
    const connection = {
      write: async () => {
        throw new Error("gatt gone");
      },
    } as unknown as SerialCommsProvider;
    const manager = new SparkDeviceManager(connection);

    await expect(manager.sendLooperCommand(LooperCommand.Play)).rejects.toThrow("gatt gone");
    // the chain recovers for the next command
    await expect(manager.sendLooperCommand(LooperCommand.Stop)).rejects.toThrow("gatt gone");
  });
});
