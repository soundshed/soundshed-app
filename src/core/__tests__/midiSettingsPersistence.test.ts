// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { AppViewModel } from "../appViewModel";
import { AppStateStore } from "../../stores/appstate";
import { InputEventMapping } from "../../spork/src/interfaces/inputEventMapping";
import { matchesSource } from "../midiMapping";

describe("MIDI mapping settings persistence", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("still provides the default note -> amp channel mappings, and they still match", () => {
    new AppViewModel().loadSettings();
    const mappings = AppStateStore.getRawState().inputEventMappings as InputEventMapping[];
    const c3 = mappings.find((m) => m.name == "C3 to CH1");
    expect(c3.source).toEqual({ type: "midi", code: "48", channel: "1" });
    expect(matchesSource(c3.source, { kind: "note", number: 48, value: 100, channel: 1 })).toBe(true);
    expect(AppStateStore.getRawState().midiListenAllInputs).toBe(false);
  });

  it("round-trips CC mappings and the listen to all inputs option", () => {
    const vm = new AppViewModel();
    vm.loadSettings();
    const ccMapping: InputEventMapping = {
      id: "x", name: "Expression → Wah",
      source: { type: "midi", kind: "cc", code: "11", channel: "any", deviceId: "Pedal" },
      target: { type: "fx-param", dspId: "pg.spark40.JH.Vox846", paramIndex: 0, min: 0.1, max: 0.9, invert: true, curve: "log" },
    };
    AppStateStore.update((s) => {
      s.inputEventMappings = [...s.inputEventMappings, ccMapping];
      s.midiListenAllInputs = true;
    });
    vm.saveSettings();

    AppStateStore.update((s) => {
      s.inputEventMappings = [];
      s.midiListenAllInputs = false;
    });
    new AppViewModel().loadSettings();

    const loaded = AppStateStore.getRawState().inputEventMappings as InputEventMapping[];
    expect(loaded.find((m) => m.id == "x")).toEqual(ccMapping);
    expect(AppStateStore.getRawState().midiListenAllInputs).toBe(true);
  });
});
