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

  it("round-trips control mappings separately from the legacy list, and the listen to all inputs option", () => {
    const vm = new AppViewModel();
    vm.loadSettings();
    const legacyCount = AppStateStore.getRawState().inputEventMappings.length;
    const ccMapping: InputEventMapping = {
      id: "x", name: "Expression → Wah",
      source: { type: "midi", kind: "cc", code: "11", channel: "any", deviceId: "Pedal" },
      target: { type: "fx-param", dspId: "pg.spark40.JH.Vox846", paramIndex: 4, min: 0.1, max: 0.9, invert: true, curve: "log" },
    };
    AppStateStore.update((s) => {
      s.midiControlMappings = [ccMapping];
      s.midiListenAllInputs = true;
    });
    vm.saveSettings();

    AppStateStore.update((s) => {
      s.inputEventMappings = [];
      s.midiControlMappings = [];
      s.midiListenAllInputs = false;
    });
    new AppViewModel().loadSettings();

    expect(AppStateStore.getRawState().midiControlMappings).toEqual([ccMapping]);
    expect(AppStateStore.getRawState().inputEventMappings).toHaveLength(legacyCount);
    expect(AppStateStore.getRawState().midiListenAllInputs).toBe(true);
  });

  it("moves control mappings saved in the legacy list into the control list", () => {
    const legacy: InputEventMapping = { id: "1", name: "C3 to CH1", source: { type: "midi", code: "48", channel: "1" }, target: { type: "amp-channel", value: "0" } };
    const cc: InputEventMapping = {
      id: "c", name: "CC", source: { type: "midi", kind: "cc", code: "11", channel: "any" },
      target: { type: "fx-param", dspId: "pg.spark40.JH.Vox846", paramIndex: 4, min: 0, max: 1, invert: false, curve: "linear" },
    };
    localStorage.setItem("settings", JSON.stringify({ inputEventMappings: [legacy, cc] }));
    new AppViewModel().loadSettings();
    expect(AppStateStore.getRawState().inputEventMappings).toEqual([legacy]);
    expect(AppStateStore.getRawState().midiControlMappings).toEqual([cc]);
  });
});
