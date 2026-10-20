import { describe, expect, it } from "vitest";
import {
  BpmMessage,
  FxChangeMessage,
  FxParamMessage,
  FxToggleMessage,
  Preset,
  PresetChangeMessage,
} from "../../../interfaces/preset";
import { SparkCommandMessage } from "../sparkCommandMessage";
import { SparkMessageReader } from "../sparkMessageReader";
import {
  buildTestPreset,
  decodeBlocks,
  decodeWithReader,
  encodeFloat,
  encodeShortString,
} from "./protocolTestUtils";

/**
 * These tests encode a command with SparkCommandMessage, normalise it the way a
 * transport does, then decode it with SparkMessageReader. A regression in either
 * the 7-bit packing or the chunk reassembly breaks the round trip, which is the
 * failure mode that silently bricks amp control.
 */

describe("round-trip: hardware preset selection", () => {
  it("preserves the selected channel number", () => {
    const messages = decodeBlocks(
      new SparkCommandMessage().change_hardware_preset(3)
    );

    expect(messages).toHaveLength(1);
    expect(messages[0].type).toBe("hardware_channel_current");
    expect((messages[0] as PresetChangeMessage).presetNumber).toBe(3);
  });

  it.each([0, 1, 2, 3])("round-trips channel %i", (channel) => {
    const messages = decodeBlocks(
      new SparkCommandMessage().change_hardware_preset(channel)
    );

    expect((messages[0] as PresetChangeMessage).presetNumber).toBe(channel);
  });

  it("updates deviceState alongside the emitted message", () => {
    const { reader } = decodeWithReader(
      new SparkCommandMessage().change_hardware_preset(2)
    );

    expect(reader.deviceState.selectedPresetNumber).toBe(2);
  });

  it("reports a stored preset distinctly from a selected one", () => {
    const messages = decodeBlocks(
      new SparkCommandMessage().store_current_preset(1)
    );

    expect(messages[0].type).toBe("hardware_preset_stored");
    expect((messages[0] as PresetChangeMessage).presetNumber).toBe(1);
  });
});

describe("round-trip: effect changes", () => {
  it("preserves both the old and new effect ids", () => {
    const messages = decodeBlocks(
      new SparkCommandMessage().change_effect("Booster", "DistortionTS9")
    );

    const msg = messages[0] as FxChangeMessage;
    expect(msg.type).toBe("fx_change_msg");
    expect(msg.dspIdOld).toBe("Booster");
    expect(msg.dspIdNew).toBe("DistortionTS9");
  });

  it("preserves amp changes, which use a different command id", () => {
    const messages = decodeBlocks(
      new SparkCommandMessage().change_amp("RolandJC120", "Twin")
    );

    const msg = messages[0] as FxChangeMessage;
    expect(msg.type).toBe("fx_change_msg");
    expect(msg.dspIdOld).toBe("RolandJC120");
    expect(msg.dspIdNew).toBe("Twin");
  });

  it("preserves dotted effect ids", () => {
    const messages = decodeBlocks(
      new SparkCommandMessage().change_effect("bias.reverb", "bias.noisegate")
    );

    expect((messages[0] as FxChangeMessage).dspIdOld).toBe("bias.reverb");
    expect((messages[0] as FxChangeMessage).dspIdNew).toBe("bias.noisegate");
  });
});

describe("round-trip: effect parameters", () => {
  it("preserves the effect id, parameter index and value", () => {
    const messages = decodeBlocks(
      new SparkCommandMessage().change_effect_parameter("Booster", 0, 0.5)
    );

    const msg = messages[0] as FxParamMessage;
    expect(msg.type).toBe("fx_param_msg");
    expect(msg.dspId).toBe("Booster");
    expect(msg.index).toBe(0);
    expect(msg.value).toBe(0.5);
  });

  it.each([0, 0.25, 0.5, 0.75, 1])(
    "round-trips parameter value %s exactly",
    (value) => {
      const messages = decodeBlocks(
        new SparkCommandMessage().change_effect_parameter("Booster", 1, value)
      );

      expect((messages[0] as FxParamMessage).value).toBe(value);
    }
  );

  it("round-trips a value that is not exactly representable as float32", () => {
    const messages = decodeBlocks(
      new SparkCommandMessage().change_effect_parameter("Booster", 1, 0.3)
    );

    expect((messages[0] as FxParamMessage).value).toBeCloseTo(0.3, 6);
  });

  it.each([0, 1, 5, 6])("round-trips parameter index %i", (index) => {
    const messages = decodeBlocks(
      new SparkCommandMessage().change_effect_parameter("bias.reverb", index, 0.5)
    );

    expect((messages[0] as FxParamMessage).index).toBe(index);
  });

  it("preserves amp parameter changes", () => {
    const messages = decodeBlocks(
      new SparkCommandMessage().change_amp_parameter("RolandJC120", 2, 0.75)
    );

    const msg = messages[0] as FxParamMessage;
    expect(msg.type).toBe("fx_param_msg");
    expect(msg.dspId).toBe("RolandJC120");
    expect(msg.index).toBe(2);
    expect(msg.value).toBe(0.75);
  });
});

describe("round-trip: effect on/off", () => {
  it("round-trips the enabled state", () => {
    const on = decodeBlocks(
      new SparkCommandMessage().turn_effect_onoff("Cloner", "On")
    );
    const off = decodeBlocks(
      new SparkCommandMessage().turn_effect_onoff("Cloner", "Off")
    );

    expect((on[0] as FxToggleMessage).type).toBe("fx_toggled");
    expect((on[0] as FxToggleMessage).active).toBe(true);
    expect((off[0] as FxToggleMessage).active).toBe(false);
    expect((on[0] as FxToggleMessage).dspId).toBe("Cloner");
  });
});

describe("round-trip: full preset across multiple chunks", () => {
  const source = buildTestPreset();
  const blocks = new SparkCommandMessage().create_preset(source);
  const messages = decodeBlocks(blocks);
  const preset = messages.find((m) => m.type === "preset")?.value as Preset;

  it("spans more than one block, exercising chunk reassembly", () => {
    expect(blocks.length).toBeGreaterThan(1);
  });

  it("reassembles into exactly one preset message", () => {
    expect(messages.filter((m) => m.type === "preset")).toHaveLength(1);
  });

  it("preserves the preset metadata", () => {
    expect(preset.meta.id).toBe(source.UUID);
    expect(preset.meta.name).toBe(source.Name);
    expect(preset.meta.version).toBe(source.Version);
    expect(preset.meta.description).toBe(source.Description);
    expect(preset.meta.icon).toBe(source.Icon);
  });

  it("preserves all seven signal path entries in order", () => {
    expect(preset.sigpath).toHaveLength(7);
    expect(preset.sigpath.map((s) => s.dspId)).toEqual(
      source.Pedals.map((p) => p.Name)
    );
  });

  it("preserves each effect's enabled state", () => {
    expect(preset.sigpath.map((s) => s.active)).toEqual(
      source.Pedals.map((p) => p.OnOff === "On")
    );
  });

  it("preserves every parameter value of every effect", () => {
    source.Pedals.forEach((pedal, i) => {
      expect(preset.sigpath[i].params.map((p) => p.value)).toEqual(
        pedal.Parameters
      );
    });
  });

  it("preserves parameter indexes", () => {
    source.Pedals.forEach((pedal, i) => {
      expect(preset.sigpath[i].params.map((p) => p.index)).toEqual(
        pedal.Parameters.map((_, idx) => idx)
      );
    });
  });

  it("round-trips a preset whose description needs the long-string encoding", () => {
    const long = buildTestPreset({
      Description: "D".repeat(80),
    });
    const decoded = decodeBlocks(
      new SparkCommandMessage().create_preset(long)
    ).find((m) => m.type === "preset")?.value as Preset;

    expect(decoded.meta.description).toBe("D".repeat(80));
  });

  it("round-trips a preset with an effect that has no parameters", () => {
    const sparse = buildTestPreset();
    sparse.Pedals[2] = { Name: "Booster", OnOff: "On", Parameters: [] };

    const decoded = decodeBlocks(
      new SparkCommandMessage().create_preset(sparse)
    ).find((m) => m.type === "preset")?.value as Preset;

    expect(decoded.sigpath[2].params).toHaveLength(0);
    expect(decoded.sigpath[3].dspId).toBe(sparse.Pedals[3].Name);
  });
});

describe("decoding messages the app does not send", () => {
  function interpret(bytes: number[]) {
    const reader = new SparkMessageReader();
    reader.set_interpreter(new Uint8Array(bytes));
    return reader;
  }

  it("treats a non-zero preset message type as unknown instead of misparsing", () => {
    const reader = interpret([0x01, 0x00]);
    reader.read_preset();

    const messages = reader.readMessageQueue();
    expect(messages).toHaveLength(1);
    expect(messages[0].type).toBe("unknown");
  });

  it("parses a Spark 2 compact preset that omits version and BPM", () => {
    // Two header strings (description, icon) instead of three, and no 0xca BPM.
    const reader = interpret([
      0x00,
      0x02,
      ...encodeShortString("uuid-1"),
      ...encodeShortString("Compact"),
      ...encodeShortString("desc"),
      ...encodeShortString("icon.png"),
      0x91, // one effect
      ...encodeShortString("Booster"),
      0xc3,
      0x91, // one parameter
      0x00,
      0x91,
      ...encodeFloat(0.5),
    ]);
    reader.read_preset();

    const preset = reader.readMessageQueue()[0].value as Preset;
    expect(preset.meta.name).toBe("Compact");
    expect(preset.meta.description).toBe("desc");
    expect(preset.meta.icon).toBe("icon.png");
    expect(preset.meta.version).toBe("0.7"); // defaulted
    expect(preset.sigpath).toHaveLength(1);
    expect(preset.sigpath[0].params[0].value).toBe(0.5);
  });

  it("emits a bpm message for the Spark 2 tempo sub-command", () => {
    const reader = interpret(encodeFloat(96));
    reader.read_bpm();

    const messages = reader.readMessageQueue();
    expect(messages[0].type).toBe("hardware_bpm");
    expect((messages[0] as BpmMessage).bpm).toBe(96);
    expect(reader.deviceState.bpm).toBe(96);
  });

  it("queues no user-facing message for an acknowledgement frame", () => {
    const reader = new SparkMessageReader();
    reader.set_interpreter(new Uint8Array([]));
    reader.run_interpreter(0x04, 0x01);

    expect(reader.readMessageQueue()).toHaveLength(0);
  });

  it("ignores an unhandled sub-command without throwing", () => {
    const reader = new SparkMessageReader();
    reader.set_interpreter(new Uint8Array([0x00]));

    expect(() => reader.run_interpreter(0x01, 0x7e)).not.toThrow();
    expect(reader.readMessageQueue()).toHaveLength(0);
  });
});

describe("batched reads", () => {
  it("decodes several independent commands delivered in one queue drain", () => {
    const blocks = [
      ...new SparkCommandMessage().change_hardware_preset(1),
      ...new SparkCommandMessage().turn_effect_onoff("Cloner", "On"),
      ...new SparkCommandMessage().change_effect_parameter("Booster", 0, 0.25),
    ];

    const messages = decodeBlocks(blocks);

    expect(messages.map((m) => m.type)).toEqual([
      "hardware_channel_current",
      "fx_toggled",
      "fx_param_msg",
    ]);
  });
});
