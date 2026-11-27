import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MidiMappingController } from "../midiMappingController";
import { MixerEvents, MixerViewModel } from "../mixerViewModel";
import { initialMixerState, MixerStateStore } from "../../stores/mixerstate";
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
      s.midiControlMappings = [];
      s.midiListenAllInputs = false;
      s.isMidiInputAvailable = true;
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

  it("matches both the legacy list and the control mapping list, but only edits the control list", () => {
    const legacy: InputEventMapping = { id: "1", name: "C3 to CH1", source: { type: "midi", code: "48", channel: "1" }, target: { type: "amp-channel", value: "0" } };
    AppStateStore.update((s) => {
      s.inputEventMappings = [legacy];
    });
    controller.addMappings([
      { id: "c", name: "CC to CH3", source: { type: "midi", kind: "cc", code: "20", channel: "any" }, target: { type: "amp-channel", value: "2" } },
    ]);
    expect(AppStateStore.getRawState().inputEventMappings).toEqual([legacy]);
    expect(controller.getMappings().map((m) => m.id)).toEqual(["c"]);

    controller.handleMidiEvent(noteOnEvent(48));
    controller.handleMidiEvent(ccEvent(20, 127));
    expect(device.setChannel.mock.calls).toEqual([[0], [2]]);
  });

  it("adds the expression -> wah preset and learns the pedal actually moved", () => {
    const result = controller.addExpressionWahPreset(true);
    expect(result.ok).toBe(true);

    const added = AppStateStore.getRawState().midiControlMappings as InputEventMapping[];
    expect(added).toHaveLength(2);
    expect(MidiStateStore.getRawState().learningMappingIds).toEqual(added.map((m) => m.id));
    expect(persist).toHaveBeenCalled();

    // the pedal sends CC 7 on channel 2: learn both mappings from it
    controller.handleMidiEvent(ccEvent(7, 40, 2));
    const learned = AppStateStore.getRawState().midiControlMappings as InputEventMapping[];
    for (const m of learned) {
      expect(m.source).toEqual({ type: "midi", kind: "cc", code: "7", channel: "2", deviceId: "Pedal" });
    }
    expect(MidiStateStore.getRawState().learningMappingIds).toEqual([]);
    expect(device.requestFxParamChangeImmediate).not.toHaveBeenCalled();

    // now moving the pedal drives the wah and switches it on off the heel
    controller.handleMidiEvent(ccEvent(7, 127, 2));
    expect(device.requestFxToggle).toHaveBeenCalledWith({ dspId: WAH, value: 1 });
    // Sensitivity (4): the Vox 846 has no pedal-position parameter and 0 is a stepped mode selector
    expect(device.requestFxParamChangeImmediate).toHaveBeenCalledWith({ dspId: WAH, index: 4, value: 1 });

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
    expect(AppStateStore.getRawState().midiControlMappings).toEqual([]);
  });

  it("does not send parameter writes for effects missing from the current preset", () => {
    AppStateStore.update((s) => {
      s.midiControlMappings = [
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
    expect(MidiStateStore.getRawState().learnStatus).toMatch(/No MIDI input received/);
  });

  it("explains a learn timeout when no MIDI input is being listened to", () => {
    AppStateStore.update((s) => {
      s.isMidiInputAvailable = false;
    });
    controller.startLearn(["a"], 1000);
    vi.advanceTimersByTime(1001);
    expect(MidiStateStore.getRawState().learnStatus).toMatch(/No MIDI input is being listened to/);
  });

  it("updates the live meter with the last event and per-mapping values", () => {
    AppStateStore.update((s) => {
      s.midiControlMappings = [
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
    let m = (AppStateStore.getRawState().midiControlMappings as InputEventMapping[])[0];
    expect(m.target).toMatchObject({ type: "fx-onoff", dspId: WAH, mode: "momentary" });
    expect(m.source).toMatchObject({ kind: "cc", code: "1", channel: "3" });

    controller.setListenAllInputs(true);
    expect(AppStateStore.getRawState().midiListenAllInputs).toBe(true);

    controller.removeMapping("m");
    expect(AppStateStore.getRawState().midiControlMappings).toEqual([]);
    expect(persist).toHaveBeenCalledTimes(4);
  });
});

describe("MidiMappingController amp mixer targets", () => {
  class FakeMixerEvents implements MixerEvents {
    invoke = vi.fn(async (_type: string, _data: any): Promise<any> => true);
    on() { }
  }

  let controller: MidiMappingController;
  let events: FakeMixerEvents;
  let mixer: MixerViewModel;
  let persist: ReturnType<typeof vi.fn<() => void>>;

  const setConnected = (connected: boolean) =>
    DeviceStateStore.update((s) => {
      s.isConnected = connected;
    });
  const sets = () =>
    events.invoke.mock.calls
      .map((c) => c[1])
      .filter((a) => a.action == "setMixerVolume")
      .map((a) => [a.data.channel, a.data.value]);
  const mixerMappings = (): InputEventMapping[] => [
    {
      id: "vol", name: "Expression → Guitar volume", source: { type: "midi", kind: "cc", code: "11", channel: "any" },
      target: { type: "mixer-volume", value: "0", min: 0, max: 1, invert: false, curve: "linear" },
    },
    {
      id: "mute", name: "Footswitch → Music mute", source: { type: "midi", kind: "cc", code: "64", channel: "any" },
      target: { type: "mixer-mute", value: "5", mode: "toggle" },
    },
  ];

  beforeEach(() => {
    vi.useFakeTimers();
    setConnected(false);
    MixerStateStore.update((s) => Object.assign(s, initialMixerState()));
    AppStateStore.update((s) => {
      s.inputEventMappings = [];
      s.midiControlMappings = [];
      s.isMidiInputAvailable = true;
    });
    MidiStateStore.update((s) => {
      s.learningMappingIds = [];
      s.learnStatus = null;
    });
    events = new FakeMixerEvents();
    mixer = new MixerViewModel(events, () => 1000, { readOnConnect: false });
    controller = new MidiMappingController();
    persist = vi.fn<() => void>();
    controller.attach(makeDevice(), persist);
    controller.attachMixer(mixer);
  });

  afterEach(() => {
    mixer.dispose();
    setConnected(false);
    vi.useRealTimers();
  });

  it("never sends on load or connect, only on incoming MIDI", async () => {
    AppStateStore.update((s) => {
      s.midiControlMappings = mixerMappings();
    });
    setConnected(true);
    await vi.advanceTimersByTimeAsync(100);
    expect(events.invoke).not.toHaveBeenCalled();

    controller.handleMidiEvent(ccEvent(11, 127));
    await vi.advanceTimersByTimeAsync(100);
    expect(sets()).toEqual([[0, 1]]);
  });

  it("drives the guitar volume and the music mute through the mixer view model", async () => {
    setConnected(true);
    await mixer.setVolume(5, 0.7);
    events.invoke.mockClear();
    AppStateStore.update((s) => {
      s.midiControlMappings = mixerMappings();
    });

    controller.handleMidiEvent(ccEvent(11, 0));
    await vi.advanceTimersByTimeAsync(100);
    controller.handleMidiEvent(ccEvent(64, 127));
    await vi.advanceTimersByTimeAsync(10);
    expect(MixerStateStore.getRawState().channels[5]).toMatchObject({ muted: true, unmuteValue: 0.7 });
    controller.handleMidiEvent(ccEvent(64, 0));
    await vi.advanceTimersByTimeAsync(400);
    controller.handleMidiEvent(ccEvent(64, 127));
    await vi.advanceTimersByTimeAsync(10);

    expect(sets()).toEqual([
      [0, 0],
      [5, 0],
      [5, 0.7],
    ]);
    expect(MixerStateStore.getRawState().channels[5]).toMatchObject({ muted: false, value: 0.7 });
  });

  it("does not send a mute the channel already has (momentary on a muted channel)", async () => {
    setConnected(true);
    await mixer.setMuted(5, true);
    events.invoke.mockClear();
    AppStateStore.update((s) => {
      s.midiControlMappings = [{ ...mixerMappings()[1], target: { type: "mixer-mute", value: "5", mode: "momentary" } }];
    });
    controller.handleMidiEvent(ccEvent(64, 127));
    await vi.advanceTimersByTimeAsync(10);
    expect(events.invoke).not.toHaveBeenCalled();
  });

  it("ignores mixer mappings while no amp is connected, without errors", async () => {
    AppStateStore.update((s) => {
      s.midiControlMappings = mixerMappings();
    });
    controller.handleMidiEvent(ccEvent(11, 100));
    controller.handleMidiEvent(ccEvent(64, 127));
    await vi.advanceTimersByTimeAsync(100);
    expect(events.invoke).not.toHaveBeenCalled();
    expect(MixerStateStore.getRawState().lastError).toBeNull();
    expect(MixerStateStore.getRawState().channels).toEqual({});
  });

  it("ignores mixer mappings when no mixer is attached", async () => {
    const bare = new MidiMappingController();
    bare.attach(makeDevice(), persist);
    setConnected(true);
    AppStateStore.update((s) => {
      s.midiControlMappings = mixerMappings();
    });
    bare.handleMidiEvent(ccEvent(11, 100));
    await vi.advanceTimersByTimeAsync(100);
    expect(events.invoke).not.toHaveBeenCalled();
  });

  it("learns a new mapping for a nav control and keeps it once a control is learned", () => {
    const id = controller.learnMixerTarget("mixer-volume", 0);
    const added = controller.getMappings();
    expect(added).toHaveLength(1);
    expect(added[0]).toMatchObject({
      id,
      name: "MIDI → Guitar volume",
      target: { type: "mixer-volume", value: "0", min: 0, max: 1, invert: false, curve: "linear" },
    });
    expect(MidiStateStore.getRawState().learningMappingIds).toEqual([id]);

    controller.handleMidiEvent(ccEvent(7, 30, 2));
    expect(controller.getMappings()[0].source).toEqual({ type: "midi", kind: "cc", code: "7", channel: "2", deviceId: "Pedal" });

    // a later cancel or timeout leaves the learned mapping alone
    controller.cancelLearn();
    expect(controller.getMappings()).toHaveLength(1);
  });

  it("removes a nav learn's mapping again if nothing is learned", () => {
    controller.learnMixerTarget("mixer-mute", 5);
    vi.advanceTimersByTime(10001);
    expect(controller.getMappings()).toEqual([]);

    controller.learnMixerTarget("mixer-mute", 5);
    controller.cancelLearn();
    expect(controller.getMappings()).toEqual([]);

    // starting another learn drops the first one too
    controller.learnMixerTarget("mixer-mute", 5);
    const second = controller.learnMixerTarget("mixer-volume", 5);
    expect(controller.getMappings().map((m) => m.id)).toEqual([second]);
  });

  it("re-learning a nav control re-assigns its one mapping, keeping its settings", async () => {
    setConnected(true);
    await mixer.setVolume(0, 0.5);
    controller.addMappings([{ ...mixerMappings()[0], target: { ...mixerMappings()[0].target, min: 0.2, max: 0.8 } }]);

    expect(controller.learnMixerTarget("mixer-volume", 0)).toBe("vol");
    controller.handleMidiEvent(ccEvent(7, 30, 2));
    const mappings = controller.getMappings();
    expect(mappings).toHaveLength(1);
    expect(mappings[0]).toMatchObject({
      id: "vol",
      source: { type: "midi", kind: "cc", code: "7", channel: "2", deviceId: "Pedal" },
      target: { type: "mixer-volume", value: "0", min: 0.2, max: 0.8 },
    });

    // the old CC no longer drives the knob, the new one does
    events.invoke.mockClear();
    controller.handleMidiEvent(ccEvent(11, 127));
    await vi.advanceTimersByTimeAsync(100);
    expect(sets()).toEqual([]);
    controller.handleMidiEvent(ccEvent(7, 127, 2));
    await vi.advanceTimersByTimeAsync(100);
    expect(sets()).toEqual([[0, 0.8]]);

    // a cancelled re-learn keeps the mapping as it was
    controller.learnMixerTarget("mixer-volume", 0);
    controller.cancelLearn();
    expect(controller.getMappings()).toEqual(mappings);
  });

  it("re-learning a mute on the same footswitch doesn't stack a second toggle", async () => {
    setConnected(true);
    await mixer.setVolume(5, 0.7);
    for (let i = 0; i < 2; i++) {
      controller.learnMixerTarget("mixer-mute", 5);
      controller.handleMidiEvent(ccEvent(80, 127));
      controller.handleMidiEvent(ccEvent(80, 0));
      await vi.advanceTimersByTimeAsync(400);
    }
    expect(controller.getMappings()).toHaveLength(1);

    events.invoke.mockClear();
    controller.handleMidiEvent(ccEvent(80, 127));
    await vi.advanceTimersByTimeAsync(10);
    expect(sets()).toEqual([[5, 0]]);
    expect(MixerStateStore.getRawState().channels[5]).toMatchObject({ muted: true });
  });

  it("with several mappings, a nav learn adds one and drops those on the same MIDI message", () => {
    const vol = mixerMappings()[0];
    controller.addMappings([
      vol,
      { ...vol, id: "vol-knob", source: { type: "midi", kind: "cc", code: "20", channel: "1" } },
      // another control on the same CC stays
      { ...vol, id: "vol-music", target: { ...vol.target, value: "5" } },
    ]);
    const id = controller.learnMixerTarget("mixer-volume", 0);
    expect(controller.getMappings()).toHaveLength(4);
    controller.handleMidiEvent(ccEvent(20, 10, 1));
    expect(controller.getMappings().map((m) => m.id)).toEqual(["vol", "vol-music", id]);
  });

  it("keeps mappings added from the settings panel when their learn times out", () => {
    controller.addMappings(mixerMappings().map((m) => ({ ...m, source: { ...m.source, code: "" } })));
    controller.startLearn(["vol"], 1000);
    vi.advanceTimersByTime(1001);
    expect(controller.getMappings()).toHaveLength(2);
  });

  it("clears every mapping of one mixer control", () => {
    controller.addMappings([
      ...mixerMappings(),
      { ...mixerMappings()[0], id: "vol2", target: { ...mixerMappings()[0].target } },
      { ...mixerMappings()[0], id: "vol-music", target: { ...mixerMappings()[0].target, value: "5" } },
    ]);
    controller.clearMixerTarget("mixer-volume", 0);
    expect(controller.getMappings().map((m) => m.id)).toEqual(["mute", "vol-music"]);
  });
});
