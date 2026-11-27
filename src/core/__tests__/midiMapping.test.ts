import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  applyCurve,
  buildExpressionWahMappings,
  combine14BitCC,
  describeSource,
  findWahTarget,
  isLearnableEvent,
  KeyedThrottle,
  matchesSource,
  MidiEventDeduper,
  MidiMappingEngine,
  MidiMappingSink,
  normaliseMidiEvent,
  NormalisedMidiEvent,
  noteName,
  scaleMidiValue,
  sourceFromEvent,
} from "../midiMapping";
import { InputEventMapping } from "../../spork/src/interfaces/inputEventMapping";
import { FxCatalogProvider } from "../../spork/src/devices/spark/sparkFxCatalog";

const cc = (number: number, value: number, channel = 1, deviceName = "Pedal"): NormalisedMidiEvent => ({
  kind: "cc", number, value, channel, deviceName,
});
const noteOn = (number: number, velocity = 100, channel = 1, deviceName = "Keys"): NormalisedMidiEvent => ({
  kind: "note", number, value: velocity, channel, deviceName, noteOff: false,
});
const noteOff = (number: number, channel = 1, deviceName = "Keys"): NormalisedMidiEvent => ({
  kind: "note", number, value: 0, channel, deviceName, noteOff: true,
});
const program = (number: number, channel = 1): NormalisedMidiEvent => ({
  kind: "program", number, value: 127, channel, deviceName: "Board",
});

// The default note mappings created by AppViewModel.loadSettings(), saved before kinds existed.
const legacyNoteMapping: InputEventMapping = {
  id: "1", name: "C3 to CH1", source: { type: "midi", code: "48", channel: "1" }, target: { type: "amp-channel", value: "0" },
};

const makeSink = (enabled: Record<string, boolean> = {}) => {
  const calls: any[] = [];
  const sink: MidiMappingSink = {
    setAmpChannel: (c) => calls.push(["channel", c]),
    setFxParam: (d, i, v) => calls.push(["param", d, i, v]),
    setFxEnabled: (d, e) => {
      enabled[d] = e;
      calls.push(["onoff", d, e]);
    },
    isFxEnabled: (d) => enabled[d],
  };
  return { sink, calls, enabled };
};

describe("normaliseMidiEvent (WebMidi v3 event shapes)", () => {
  it("reads controller number, raw 7-bit value and channel from a control change", () => {
    const e = {
      type: "controlchange",
      controller: { number: 11, name: "expressioncoarse" },
      value: 0.5039, // WebMidi v3 normalises this to 0..1
      rawValue: 64,
      message: { channel: 3, dataBytes: [11, 64], type: "controlchange" },
      port: { name: "Boss FS" },
    };
    expect(normaliseMidiEvent(e)).toEqual({ kind: "cc", number: 11, value: 64, channel: 3, deviceName: "Boss FS" });
  });

  it("reads note number and velocity from a note on, and flags note off", () => {
    const on = { type: "noteon", note: { number: 48, rawAttack: 90 }, message: { channel: 1, dataBytes: [48, 90] }, port: { name: "Keys" } };
    expect(normaliseMidiEvent(on)).toMatchObject({ kind: "note", number: 48, value: 90, noteOff: false });

    const off = { type: "noteoff", note: { number: 48, rawAttack: 0 }, message: { channel: 1, dataBytes: [48, 0] } };
    expect(normaliseMidiEvent(off)).toMatchObject({ kind: "note", number: 48, value: 0, noteOff: true });
  });

  it("reads the program number from a program change", () => {
    const e = { type: "programchange", value: 5, rawValue: 5, message: { channel: 2, dataBytes: [5] } };
    expect(normaliseMidiEvent(e)).toMatchObject({ kind: "program", number: 5, channel: 2 });
  });

  it("ignores messages mappings don't use", () => {
    expect(normaliseMidiEvent({ type: "pitchbend", value: 0.2, message: { channel: 1, dataBytes: [0, 70] } })).toBeNull();
    expect(normaliseMidiEvent(null)).toBeNull();
  });
});

describe("matchesSource", () => {
  it("matches a CC by controller number, not by its value", () => {
    const source = { type: "midi", kind: "cc" as const, code: "11", channel: "1" };
    expect(matchesSource(source, cc(11, 0))).toBe(true);
    expect(matchesSource(source, cc(11, 127))).toBe(true);
    // the old code compared code with e.value: CC 7 at value 11 must not match CC 11
    expect(matchesSource(source, cc(7, 11))).toBe(false);
  });

  it("respects the MIDI channel, with 'any' matching all channels", () => {
    const ch2 = { type: "midi", kind: "cc" as const, code: "11", channel: "2" };
    expect(matchesSource(ch2, cc(11, 10, 2))).toBe(true);
    expect(matchesSource(ch2, cc(11, 10, 1))).toBe(false);

    const any = { type: "midi", kind: "cc" as const, code: "11", channel: "any" };
    for (let ch = 1; ch <= 16; ch++) expect(matchesSource(any, cc(11, 10, ch))).toBe(true);
  });

  it("matches notes by note number and programs by program number", () => {
    expect(matchesSource({ type: "midi", kind: "note", code: "60", channel: "1" }, noteOn(60))).toBe(true);
    expect(matchesSource({ type: "midi", kind: "note", code: "60", channel: "1" }, noteOn(61))).toBe(false);
    expect(matchesSource({ type: "midi", kind: "program", code: "3", channel: "any" }, program(3, 9))).toBe(true);
    expect(matchesSource({ type: "midi", kind: "program", code: "3", channel: "any" }, program(4))).toBe(false);
    // kinds don't cross-match
    expect(matchesSource({ type: "midi", kind: "note", code: "11", channel: "any" }, cc(11, 100))).toBe(false);
  });

  it("filters by input device when one is set", () => {
    const source = { type: "midi", kind: "cc" as const, code: "11", channel: "any", deviceId: "Pedal" };
    expect(matchesSource(source, cc(11, 1, 1, "Pedal"))).toBe(true);
    expect(matchesSource(source, cc(11, 1, 1, "Other"))).toBe(false);
    expect(matchesSource({ ...source, deviceId: "" }, cc(11, 1, 1, "Other"))).toBe(true);
  });

  it("keeps legacy (kind-less) mappings working: note number or program number, any channel", () => {
    expect(matchesSource(legacyNoteMapping.source, noteOn(48, 100, 1))).toBe(true);
    expect(matchesSource(legacyNoteMapping.source, noteOn(48, 100, 10))).toBe(true);
    expect(matchesSource(legacyNoteMapping.source, noteOff(48))).toBe(false);
    expect(matchesSource(legacyNoteMapping.source, program(48))).toBe(true);
    expect(matchesSource(legacyNoteMapping.source, cc(48, 48))).toBe(false);
    expect(matchesSource(legacyNoteMapping.source, noteOn(50))).toBe(false);
  });

  it("never matches keyboard sources or unlearned codes", () => {
    expect(matchesSource({ type: "keyboard", code: "48" }, noteOn(48))).toBe(false);
    expect(matchesSource({ type: "midi", kind: "cc", code: "", channel: "any" }, cc(0, 0))).toBe(false);
  });
});

describe("value scaling", () => {
  it("maps 0..127 linearly onto 0..1 by default", () => {
    expect(scaleMidiValue(0)).toBe(0);
    expect(scaleMidiValue(127)).toBe(1);
    expect(scaleMidiValue(63.5)).toBeCloseTo(0.5, 3);
  });

  it("maps into a custom range", () => {
    expect(scaleMidiValue(0, { min: 0.2, max: 0.8 })).toBeCloseTo(0.2);
    expect(scaleMidiValue(127, { min: 0.2, max: 0.8 })).toBeCloseTo(0.8);
  });

  it("inverts", () => {
    expect(scaleMidiValue(0, { invert: true })).toBe(1);
    expect(scaleMidiValue(127, { invert: true })).toBe(0);
    expect(scaleMidiValue(127, { min: 0.2, max: 0.8, invert: true })).toBeCloseTo(0.2);
  });

  it("supports a log curve that keeps the end points", () => {
    expect(applyCurve(0, "log")).toBe(0);
    expect(applyCurve(1, "log")).toBeCloseTo(1);
    expect(applyCurve(0.5, "log")).toBeGreaterThan(0.5);
    expect(scaleMidiValue(64, { curve: "log" })).toBeGreaterThan(scaleMidiValue(64));
  });

  it("clamps out of range input", () => {
    expect(scaleMidiValue(200)).toBe(1);
    expect(scaleMidiValue(-5)).toBe(0);
  });

  it("supports 14-bit values", () => {
    expect(combine14BitCC(127, 127)).toBe(16383);
    expect(combine14BitCC(64, 0)).toBe(8192);
    expect(scaleMidiValue(16383, {}, 16383)).toBe(1);
  });
});

describe("KeyedThrottle", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("sends the first value at once, then only the latest value per interval", () => {
    const sent: number[] = [];
    const t = new KeyedThrottle<number>(25);
    const send = (v: number) => sent.push(v);

    t.push("a", 1, send);
    expect(sent).toEqual([1]);

    t.push("a", 2, send);
    t.push("a", 3, send);
    t.push("a", 4, send);
    expect(sent).toEqual([1]);

    vi.advanceTimersByTime(25);
    expect(sent).toEqual([1, 4]);

    vi.advanceTimersByTime(25);
    expect(sent).toEqual([1, 4]);
    expect(t.activeKeys).toEqual([]);
  });

  it("always delivers the trailing value of a continuous sweep", () => {
    const sent: number[] = [];
    const t = new KeyedThrottle<number>(25);
    // a pedal sweep: one message every 5 ms for 200 ms
    for (let i = 0; i <= 40; i++) {
      t.push("wah", i, (v) => sent.push(v));
      vi.advanceTimersByTime(5);
    }
    vi.advanceTimersByTime(100);
    expect(sent[sent.length - 1]).toBe(40);
    // ~200ms / 25ms writes plus the leading one, far fewer than 41 messages
    expect(sent.length).toBeLessThanOrEqual(10);
    expect(sent.length).toBeGreaterThanOrEqual(8);
  });

  it("throttles keys independently", () => {
    const sent: string[] = [];
    const t = new KeyedThrottle<number>(25);
    t.push("a", 1, (v) => sent.push("a" + v));
    t.push("b", 1, (v) => sent.push("b" + v));
    t.push("a", 2, (v) => sent.push("a" + v));
    expect(sent).toEqual(["a1", "b1"]);
    vi.advanceTimersByTime(25);
    expect(sent).toEqual(["a1", "b1", "a2"]);
  });

  it("flush sends pending values immediately", () => {
    const sent: number[] = [];
    const t = new KeyedThrottle<number>(25);
    t.push("a", 1, (v) => sent.push(v));
    t.push("a", 2, (v) => sent.push(v));
    t.flush();
    expect(sent).toEqual([1, 2]);
  });
});

describe("MidiEventDeduper", () => {
  it("drops exact repeats inside the window only", () => {
    const d = new MidiEventDeduper(30);
    expect(d.isDuplicate(cc(11, 64), 0)).toBe(false);
    expect(d.isDuplicate(cc(11, 64), 10)).toBe(true);
    expect(d.isDuplicate(cc(11, 64), 100)).toBe(false);
  });

  it("does not drop a different controller sending the same value", () => {
    const d = new MidiEventDeduper(30);
    expect(d.isDuplicate(cc(11, 64), 0)).toBe(false);
    expect(d.isDuplicate(cc(7, 64), 1)).toBe(false);
    expect(d.isDuplicate(cc(11, 64, 2), 2)).toBe(false);
    expect(d.isDuplicate(cc(11, 64, 1, "Other"), 3)).toBe(false);
  });
});

describe("MidiMappingEngine", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const fxParamMapping = (over: Partial<InputEventMapping["target"]> = {}, code = "11"): InputEventMapping => ({
    id: "p" + code,
    name: "Expression",
    source: { type: "midi", kind: "cc", code, channel: "any" },
    target: { type: "fx-param", dspId: "pg.spark40.JH.Vox846", paramIndex: 0, min: 0, max: 1, invert: false, curve: "linear", ...over },
  });

  it("triggers legacy note -> amp channel mappings", () => {
    const { sink, calls } = makeSink();
    const engine = new MidiMappingEngine(sink);
    engine.handleEvent(noteOn(48), [legacyNoteMapping]);
    engine.handleEvent(noteOff(48), [legacyNoteMapping]);
    expect(calls).toEqual([["channel", 0]]);
  });

  it("sends scaled, rate limited parameter values for a CC sweep, ending on the last value", () => {
    const { sink, calls } = makeSink();
    const engine = new MidiMappingEngine(sink, { throttleMs: 25 });
    const mappings = [fxParamMapping()];
    for (let v = 0; v <= 127; v++) {
      engine.handleEvent(cc(11, v), mappings);
      vi.advanceTimersByTime(2);
    }
    vi.advanceTimersByTime(50);
    expect(calls.length).toBeLessThan(20);
    expect(calls[0]).toEqual(["param", "pg.spark40.JH.Vox846", 0, 0]);
    expect(calls[calls.length - 1]).toEqual(["param", "pg.spark40.JH.Vox846", 0, 1]);
  });

  it("keeps two controllers that send the same value", () => {
    const { sink, calls } = makeSink();
    const engine = new MidiMappingEngine(sink);
    const mappings = [
      fxParamMapping({ paramIndex: 0 }, "11"),
      fxParamMapping({ paramIndex: 4 }, "12"),
    ];
    engine.handleEvent(cc(11, 127), mappings);
    engine.handleEvent(cc(12, 127), mappings);
    expect(calls).toEqual([
      ["param", "pg.spark40.JH.Vox846", 0, 1],
      ["param", "pg.spark40.JH.Vox846", 4, 1],
    ]);
  });

  it("applies invert and range to parameter writes", () => {
    const { sink, calls } = makeSink();
    const engine = new MidiMappingEngine(sink);
    engine.handleEvent(cc(11, 127), [fxParamMapping({ invert: true, min: 0.1, max: 0.9 })]);
    expect(calls[0][3]).toBeCloseTo(0.1);
  });

  it("toggles an effect on each footswitch press", () => {
    const { sink, calls } = makeSink({ fx: false });
    const engine = new MidiMappingEngine(sink);
    const m: InputEventMapping = {
      id: "t", name: "t", source: { type: "midi", kind: "cc", code: "80", channel: "any" },
      target: { type: "fx-onoff", dspId: "fx", mode: "toggle" },
    };
    engine.handleEvent(cc(80, 127), [m]);
    engine.handleEvent(cc(80, 0), [m]);
    engine.handleEvent(cc(80, 127), [m]);
    expect(calls).toEqual([["onoff", "fx", true], ["onoff", "fx", false]]);
  });

  it("toggles again for a switch that only sends 127, once it is pressed again later", () => {
    const { sink, calls } = makeSink({ fx: false });
    let now = 0;
    const engine = new MidiMappingEngine(sink, { now: () => now });
    const m: InputEventMapping = {
      id: "t", name: "t", source: { type: "midi", kind: "cc", code: "80", channel: "any" },
      target: { type: "fx-onoff", dspId: "fx", mode: "toggle" },
    };
    engine.handleEvent(cc(80, 127), [m]);
    now = 10;
    engine.handleEvent(cc(80, 127), [m]); // duplicate, dropped
    now = 800;
    engine.handleEvent(cc(80, 127), [m]);
    expect(calls).toEqual([["onoff", "fx", true], ["onoff", "fx", false]]);
  });

  it("momentary mode follows the switch", () => {
    const { sink, calls } = makeSink({ fx: false });
    const engine = new MidiMappingEngine(sink);
    const m: InputEventMapping = {
      id: "m", name: "m", source: { type: "midi", kind: "note", code: "60", channel: "any" },
      target: { type: "fx-onoff", dspId: "fx", mode: "momentary" },
    };
    engine.handleEvent(noteOn(60, 20), [m]);
    engine.handleEvent(noteOff(60), [m]);
    expect(calls).toEqual([["onoff", "fx", true], ["onoff", "fx", false]]);
  });

  it("threshold mode switches on when the pedal leaves heel and off at heel, without repeating", () => {
    const { sink, calls } = makeSink({ wah: false });
    const engine = new MidiMappingEngine(sink);
    const m: InputEventMapping = {
      id: "h", name: "h", source: { type: "midi", kind: "cc", code: "11", channel: "any" },
      target: { type: "fx-onoff", dspId: "wah", mode: "threshold", threshold: 3 },
    };
    for (const v of [0, 1, 2, 3, 10, 60, 127, 60, 2, 1, 0]) engine.handleEvent(cc(11, v), [m]);
    expect(calls).toEqual([["onoff", "wah", true], ["onoff", "wah", false]]);
  });

  it("passes other target types to registered handlers, so tuner/looper can plug in", () => {
    const { sink } = makeSink();
    const engine = new MidiMappingEngine(sink);
    const handler = vi.fn();
    const unregister = engine.registerTargetHandler("tuner-toggle", handler);
    const m: InputEventMapping = {
      id: "x", name: "x", source: { type: "midi", kind: "cc", code: "20", channel: "any" }, target: { type: "tuner-toggle" },
    };
    engine.handleEvent(cc(20, 127), [m]);
    expect(handler).toHaveBeenCalledWith(m, expect.objectContaining({ number: 20 }));
    unregister();
    engine.handleEvent(cc(20, 0), [m]);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("ignores unknown target types without a handler", () => {
    const { sink, calls } = makeSink();
    const engine = new MidiMappingEngine(sink);
    const m: InputEventMapping = {
      id: "x", name: "x", source: { type: "midi", kind: "cc", code: "20", channel: "any" }, target: { type: "looper-command", value: "record" },
    };
    expect(engine.handleEvent(cc(20, 127), [m]).matched).toEqual([m]);
    expect(calls).toEqual([]);
  });
});

describe("learn helpers", () => {
  it("builds a source from a captured event", () => {
    expect(sourceFromEvent(cc(11, 33, 4, "Pedal"))).toEqual({ type: "midi", kind: "cc", code: "11", channel: "4", deviceId: "Pedal" });
    expect(sourceFromEvent(cc(11, 33, 4, "Pedal"), { anyDevice: true, anyChannel: true })).toEqual({
      type: "midi", kind: "cc", code: "11", channel: "any",
    });
  });

  it("does not learn note offs", () => {
    expect(isLearnableEvent(noteOff(60))).toBe(false);
    expect(isLearnableEvent(noteOn(60))).toBe(true);
  });

  it("describes sources", () => {
    expect(noteName(48)).toBe("C3");
    expect(describeSource({ type: "midi", kind: "cc", code: "11", channel: "any" })).toBe("CC 11 · any ch");
    expect(describeSource({ type: "midi", kind: "note", code: "60", channel: "2", deviceId: "Keys" })).toBe("Note 60 (C4) · ch 2 · Keys");
    expect(describeSource(legacyNoteMapping.source)).toBe("Note/Program 48");
  });
});

describe("expression pedal -> wah preset", () => {
  const catalog = FxCatalogProvider.getFxCatalog();
  const tone = {
    fx: [
      { type: "pg.spark40.bias.noisegate", name: "Noise Gate", enabled: true, params: [{ paramId: "0", value: 0.5 }] },
      {
        type: "pg.spark40.JH.Vox846", name: "Vox 846 Wah", enabled: false,
        params: [0, 1, 2, 3, 4].map((i) => ({ paramId: i.toString(), value: 0.5 })),
      },
    ],
  };

  it("finds the wah in the current preset via the fx catalog", () => {
    expect(findWahTarget(tone, catalog)).toEqual({
      dspId: "pg.spark40.JH.Vox846", name: "Vox 846 Wah", paramIndex: 0, paramName: "Wah Shape",
    });
  });

  it("returns null when the preset has no wah", () => {
    expect(findWahTarget({ fx: [tone.fx[0]] }, catalog)).toBeNull();
    expect(findWahTarget(null, catalog)).toBeNull();
  });

  it("builds a CC 11 position mapping and an optional heel switch mapping", () => {
    let n = 0;
    const wah = findWahTarget(tone, catalog);
    const [pos, onoff] = buildExpressionWahMappings(wah, { autoEnable: true, makeId: () => "id" + n++ });
    expect(pos.source).toEqual({ type: "midi", kind: "cc", code: "11", channel: "any" });
    expect(pos.target).toMatchObject({ type: "fx-param", dspId: "pg.spark40.JH.Vox846", paramIndex: 0 });
    expect(onoff.target).toMatchObject({ type: "fx-onoff", dspId: "pg.spark40.JH.Vox846", mode: "threshold" });
    expect(buildExpressionWahMappings(wah, { autoEnable: false })).toHaveLength(1);
  });

  it("drives the wah end to end through the engine", () => {
    const { sink, calls } = makeSink({ "pg.spark40.JH.Vox846": false });
    const engine = new MidiMappingEngine(sink);
    const mappings = buildExpressionWahMappings(findWahTarget(tone, catalog), { autoEnable: true });
    engine.handleEvent(cc(11, 0, 5), mappings);
    engine.handleEvent(cc(11, 127, 5), mappings);
    engine.flush();
    expect(calls).toContainEqual(["onoff", "pg.spark40.JH.Vox846", true]);
    expect(calls).toContainEqual(["param", "pg.spark40.JH.Vox846", 0, 1]);
  });
});
