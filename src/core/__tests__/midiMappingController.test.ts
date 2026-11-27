import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MidiMappingController } from "../midiMappingController";
import { AppStateStore } from "../../stores/appstate";
import { DeviceStateStore } from "../../stores/devicestate";
import { MidiStateStore } from "../../stores/midistate";
import { FxCatalogProvider } from "../../spork/src/devices/spark/sparkFxCatalog";
import { InputEventMapping } from "../../spork/src/interfaces/inputEventMapping";

const WAH = "pg.spark40.JH.Vox846";

const tone = () => ({
  name: "Test",
  fx: [
    { type: "pg.spark40.bias.noisegate", name: "Noise Gate", enabled: true, params: [{ paramId: "0", value: 0.5, enabled: true }] },
    {
      type: WAH, name: "Vox 846 Wah", enabled: false,
      params: [0, 1, 2, 3, 4].map((i) => ({ paramId: i.toString(), value: 0.5, enabled: true })),
    },
  ],
});

// WebMidi v3 shaped events
const ccEvent = (number: number, rawValue: number, channel = 1, port = "Pedal") => ({
  type: "controlchange",
  controller: { number },
  value: rawValue / 127,
  rawValue,
  message: { channel, dataBytes: [number, rawValue] },
  port: { name: port },
});
const noteOnEvent = (number: number, channel = 1) => ({
  type: "noteon",
  note: { number, rawAttack: 100 },
  rawValue: 100,
  message: { channel, dataBytes: [number, 100] },
  port: { name: "Keys" },
});

const makeDevice = () => ({
  setChannel: vi.fn().mockResolvedValue(true),
  requestFxParamChangeImmediate: vi.fn().mockResolvedValue(true),
  requestFxToggle: vi.fn().mockImplementation(async (args) => {
    // like DeviceViewModel.requestFxToggle, reflect the change in the preset state
    DeviceStateStore.update((s) => {
      s.presetTone.fx.find((f) => f.type == args.dspId).enabled = args.value == 1;
    });
    return true;
  }),
});

describe("MidiMappingController", () => {
  let controller: MidiMappingController;
  let device: ReturnType<typeof makeDevice>;
  let persist: ReturnType<typeof vi.fn<() => void>>;

  beforeEach(() => {
    vi.useFakeTimers();
    DeviceStateStore.update((s) => {
      s.presetTone = tone();
      s.fxCatalog = FxCatalogProvider.getFxCatalog();
    });
    AppStateStore.update((s) => {
      s.inputEventMappings = [];
      s.midiListenAllInputs = false;
    });
    MidiStateStore.update((s) => {
      s.lastEvent = null;
      s.lastValues = {};
      s.learningMappingIds = [];
      s.learnStatus = null;
    });
    controller = new MidiMappingController();
    device = makeDevice();
    persist = vi.fn<() => void>();
    controller.attach(device, persist);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("keeps the default legacy note mappings switching amp channels", () => {
    AppStateStore.update((s) => {
      s.inputEventMappings = [
        { id: "1", name: "C3 to CH1", source: { type: "midi", code: "48", channel: "1" }, target: { type: "amp-channel", value: "0" } },
        { id: "2", name: "D3 to CH2", source: { type: "midi", code: "50", channel: "1" }, target: { type: "amp-channel", value: "1" } },
      ];
    });
    controller.handleMidiEvent(noteOnEvent(50, 7));
    expect(device.setChannel).toHaveBeenCalledWith(1);
  });

  it("adds the expression -> wah preset and learns the pedal actually moved", () => {
    const result = controller.addExpressionWahPreset(true);
    expect(result.ok).toBe(true);

    const added = AppStateStore.getRawState().inputEventMappings as InputEventMapping[];
    expect(added).toHaveLength(2);
    expect(MidiStateStore.getRawState().learningMappingIds).toEqual(added.map((m) => m.id));
    expect(persist).toHaveBeenCalled();

    // the pedal sends CC 7 on channel 2: learn both mappings from it
    controller.handleMidiEvent(ccEvent(7, 40, 2));
    const learned = AppStateStore.getRawState().inputEventMappings as InputEventMapping[];
    for (const m of learned) {
      expect(m.source).toEqual({ type: "midi", kind: "cc", code: "7", channel: "2", deviceId: "Pedal" });
    }
    expect(MidiStateStore.getRawState().learningMappingIds).toEqual([]);
    expect(device.requestFxParamChangeImmediate).not.toHaveBeenCalled();

    // now moving the pedal drives the wah and switches it on off the heel
    controller.handleMidiEvent(ccEvent(7, 127, 2));
    expect(device.requestFxToggle).toHaveBeenCalledWith({ dspId: WAH, value: 1 });
    expect(device.requestFxParamChangeImmediate).toHaveBeenCalledWith({ dspId: WAH, index: 0, value: 1 });

    // other controllers / channels don't
    device.requestFxParamChangeImmediate.mockClear();
    controller.handleMidiEvent(ccEvent(11, 64, 2));
    controller.handleMidiEvent(ccEvent(7, 64, 3));
    vi.advanceTimersByTime(100);
    expect(device.requestFxParamChangeImmediate).not.toHaveBeenCalled();
  });

  it("reports when the preset has no wah", () => {
    DeviceStateStore.update((s) => {
      s.presetTone = { name: "x", fx: [tone().fx[0]] };
    });
    expect(controller.addExpressionWahPreset(true).ok).toBe(false);
    expect(AppStateStore.getRawState().inputEventMappings).toEqual([]);
  });

  it("does not send parameter writes for effects missing from the current preset", () => {
    AppStateStore.update((s) => {
      s.inputEventMappings = [
        {
          id: "p", name: "p", source: { type: "midi", kind: "cc", code: "1", channel: "any" },
          target: { type: "fx-param", dspId: "pg.spark40.SomethingElse", paramIndex: 0, min: 0, max: 1, invert: false, curve: "linear" },
        },
      ];
    });
    controller.handleMidiEvent(ccEvent(1, 100));
    vi.advanceTimersByTime(100);
    expect(device.requestFxParamChangeImmediate).not.toHaveBeenCalled();
  });

  it("cancels learn after the timeout", () => {
    controller.startLearn(["a"], 1000);
    vi.advanceTimersByTime(1001);
    expect(MidiStateStore.getRawState().learningMappingIds).toEqual([]);
    expect(MidiStateStore.getRawState().learnStatus).toMatch(/No MIDI input/);
  });

  it("updates the live meter with the last event and per-mapping values", () => {
    AppStateStore.update((s) => {
      s.inputEventMappings = [
        {
          id: "p", name: "p", source: { type: "midi", kind: "cc", code: "11", channel: "any" },
          target: { type: "fx-param", dspId: WAH, paramIndex: 0, min: 0, max: 1, invert: false, curve: "linear" },
        },
      ];
    });
    controller.handleMidiEvent(ccEvent(11, 90));
    controller.handleMidiEvent(ccEvent(11, 91));
    vi.advanceTimersByTime(100);
    expect(MidiStateStore.getRawState().lastEvent).toMatchObject({ kind: "cc", number: 11, value: 91 });
    expect(MidiStateStore.getRawState().lastValues).toEqual({ p: 91 });
  });

  it("edits, removes and persists mappings", () => {
    controller.addMappings([
      { id: "m", name: "m", source: { type: "midi", kind: "cc", code: "1", channel: "any" }, target: { type: "fx-onoff", dspId: WAH, mode: "toggle" } },
    ]);
    controller.patchMapping("m", { target: { mode: "momentary" }, source: { channel: "3" } });
    let m = (AppStateStore.getRawState().inputEventMappings as InputEventMapping[])[0];
    expect(m.target).toMatchObject({ type: "fx-onoff", dspId: WAH, mode: "momentary" });
    expect(m.source).toMatchObject({ kind: "cc", code: "1", channel: "3" });

    controller.setListenAllInputs(true);
    expect(AppStateStore.getRawState().midiListenAllInputs).toBe(true);

    controller.removeMapping("m");
    expect(AppStateStore.getRawState().inputEventMappings).toEqual([]);
    expect(persist).toHaveBeenCalledTimes(4);
  });
});
