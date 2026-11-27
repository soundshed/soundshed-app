// @vitest-environment jsdom
import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "../../testing/componentTestSetup";
import { AppStateStore } from "../../stores/appstate";
import { DeviceStateStore } from "../../stores/devicestate";
import { MidiStateStore } from "../../stores/midistate";
import { FxCatalogProvider } from "../../spork/src/devices/spark/sparkFxCatalog";
import { InputEventMapping } from "../../spork/src/interfaces/inputEventMapping";
import { midiMappingController } from "../../core/midiMappingController";
import MidiMappingPanel from "../device/midi-learn/MidiMappingPanel";

const WAH = "pg.spark40.JH.Vox846";

const legacy: InputEventMapping = {
  id: "1", name: "C3 to CH1", source: { type: "midi", code: "48", channel: "1" }, target: { type: "amp-channel", value: "0" },
};

const mappings = () => AppStateStore.getRawState().midiControlMappings as InputEventMapping[];

describe("MidiMappingPanel", () => {
  const device = {
    setChannel: vi.fn().mockResolvedValue(true),
    requestFxParamChangeImmediate: vi.fn().mockResolvedValue(true),
    requestFxToggle: vi.fn().mockResolvedValue(true),
  };
  const persist = vi.fn();

  beforeEach(() => {
    midiMappingController.attach(device, persist);
    act(() => {
      DeviceStateStore.update((s) => {
        s.fxCatalog = FxCatalogProvider.getFxCatalog();
        s.presetTone = {
          name: "Test",
          fx: [
            { type: "pg.spark40.bias.noisegate", name: "Noise Gate", enabled: true, params: [{ paramId: "0", value: 0.5 }] },
            { type: WAH, name: "Vox 846 Wah", enabled: false, params: [0, 1, 2, 3, 4].map((i) => ({ paramId: i.toString(), value: 0.5 })) },
          ],
        };
      });
      AppStateStore.update((s) => {
        s.inputEventMappings = [legacy];
        s.midiControlMappings = [];
        s.midiInputs = [{ name: "Pedal", type: "midi" }];
        s.midiListenAllInputs = false;
        s.isMidiInputAvailable = true;
      });
      MidiStateStore.update((s) => {
        s.lastEvent = null;
        s.lastValues = {};
        s.learningMappingIds = [];
        s.learnStatus = null;
      });
    });
  });

  afterEach(() => {
    act(() => midiMappingController.cancelLearn());
  });

  it("leaves legacy note mappings to the existing table", () => {
    render(<MidiMappingPanel />);
    expect(screen.getByText("No MIDI control mappings yet.")).toBeInTheDocument();
    expect(screen.queryByRole("note")).toBeNull();
  });

  it("explains when no MIDI input is being listened to", () => {
    act(() => {
      AppStateStore.update((s) => {
        s.isMidiInputAvailable = false;
      });
    });
    render(<MidiMappingPanel />);
    expect(screen.getByRole("note")).toHaveTextContent(/No MIDI input is being listened to/);
  });

  it("adds the expression pedal -> wah preset and shows it learning", () => {
    render(<MidiMappingPanel />);
    fireEvent.click(screen.getByRole("button", { name: /Expression pedal → Wah sensitivity/ }));

    // kept out of the legacy list, so the old Settings table never shows or re-learns them
    expect(AppStateStore.getRawState().inputEventMappings).toEqual([legacy]);
    expect(mappings()).toHaveLength(2);
    expect(mappings()[0].target).toMatchObject({ type: "fx-param", dspId: WAH, paramIndex: 4 });
    expect(mappings()[1].target).toMatchObject({ type: "fx-onoff", dspId: WAH, mode: "threshold" });
    expect(screen.getAllByText("Listening…")).toHaveLength(2);
    expect(screen.getByRole("status")).toHaveTextContent(/Move a control/);
    expect(screen.getAllByText(/Vox 846 Wah · Sensitivity/).length).toBeGreaterThan(0);
  });

  it("adds a parameter mapping for an effect of the current preset and learns a CC", () => {
    render(<MidiMappingPanel />);
    fireEvent.change(screen.getByLabelText("Effect"), { target: { value: WAH } });
    fireEvent.change(screen.getByLabelText("Parameter"), { target: { value: "4" } });
    fireEvent.click(screen.getByRole("button", { name: "Add & Learn" }));

    const added = mappings()[0];
    expect(added.target).toMatchObject({ type: "fx-param", dspId: WAH, paramIndex: 4 });

    act(() => {
      midiMappingController.handleMidiEvent({
        type: "controlchange", controller: { number: 21 }, rawValue: 10, value: 10 / 127,
        message: { channel: 1, dataBytes: [21, 10] }, port: { name: "Pedal" },
      });
    });
    expect(mappings()[0].source).toEqual({ type: "midi", kind: "cc", code: "21", channel: "1", deviceId: "Pedal" });
    expect(screen.getByText("CC 21 · ch 1 · Pedal")).toBeInTheDocument();
  });

  it("edits range, invert and curve, and deletes a mapping", () => {
    act(() => {
      AppStateStore.update((s) => {
        s.midiControlMappings = [
          {
            id: "p", name: "Knob", source: { type: "midi", kind: "cc", code: "1", channel: "any" },
            target: { type: "fx-param", dspId: WAH, paramIndex: 0, min: 0, max: 1, invert: false, curve: "linear" },
          },
        ];
      });
    });
    render(<MidiMappingPanel />);

    fireEvent.change(screen.getByLabelText("Max"), { target: { value: "0.6" } });
    fireEvent.click(screen.getByLabelText("Invert"));
    fireEvent.change(screen.getByLabelText("Curve"), { target: { value: "log" } });
    expect(mappings()[0].target).toMatchObject({ max: 0.6, invert: true, curve: "log" });

    fireEvent.click(screen.getByRole("button", { name: "Delete Knob" }));
    expect(mappings()).toEqual([]);
    expect(AppStateStore.getRawState().inputEventMappings).toEqual([legacy]);
  });

  it("adds Amp volume and Amp mute mappings for the chosen mixer channel and learns them", () => {
    render(<MidiMappingPanel />);
    fireEvent.change(screen.getByLabelText("Target"), { target: { value: "mixer-volume" } });
    // the mixer needs no effect choice, and offers only Guitar and Music
    expect(screen.queryByLabelText("Effect")).toBeNull();
    const channels = screen.getByLabelText("Mixer channel") as HTMLSelectElement;
    expect(Array.from(channels.options).map((o) => [o.value, o.text])).toEqual([["0", "Guitar"], ["5", "Music"]]);
    fireEvent.click(screen.getByRole("button", { name: "Add & Learn" }));

    expect(mappings()[0]).toMatchObject({
      name: "MIDI → Guitar volume",
      target: { type: "mixer-volume", value: "0", min: 0, max: 1, invert: false, curve: "linear" },
    });
    expect(MidiStateStore.getRawState().learningMappingIds).toEqual([mappings()[0].id]);

    fireEvent.change(screen.getByLabelText("Target"), { target: { value: "mixer-mute" } });
    fireEvent.change(screen.getByLabelText("Mixer channel"), { target: { value: "5" } });
    fireEvent.click(screen.getByRole("button", { name: "Add & Learn" }));

    expect(mappings()[1]).toMatchObject({ name: "MIDI → Music mute", target: { type: "mixer-mute", value: "5", mode: "toggle" } });
    expect(MidiStateStore.getRawState().learningMappingIds).toEqual([mappings()[1].id]);
    // added from the panel, so kept for a later Learn even if nothing is learned now
    act(() => midiMappingController.cancelLearn());
    expect(mappings()).toHaveLength(2);
    expect(AppStateStore.getRawState().inputEventMappings).toEqual([legacy]);
  });

  it("can add mixer mappings without a connected amp", () => {
    act(() => {
      DeviceStateStore.update((s) => {
        s.presetTone = null;
      });
    });
    render(<MidiMappingPanel />);
    fireEvent.change(screen.getByLabelText("Target"), { target: { value: "mixer-mute" } });
    expect(screen.getByRole("button", { name: "Add & Learn" })).toBeEnabled();
  });

  it("edits mixer volume like a parameter and mixer mute like an on/off switch", () => {
    act(() => {
      AppStateStore.update((s) => {
        s.midiControlMappings = [
          {
            id: "v", name: "Pedal volume", source: { type: "midi", kind: "cc", code: "11", channel: "any" },
            target: { type: "mixer-volume", value: "0", min: 0, max: 1, invert: false, curve: "linear" },
          },
        ];
      });
    });
    const { unmount } = render(<MidiMappingPanel />);
    expect(screen.getAllByText("Guitar volume").length).toBeGreaterThan(0);
    expect(screen.queryByLabelText("Mode")).toBeNull();
    fireEvent.change(screen.getByLabelText("Min"), { target: { value: "0.1" } });
    fireEvent.change(screen.getByLabelText("Max"), { target: { value: "0.8" } });
    fireEvent.click(screen.getByLabelText("Invert"));
    fireEvent.change(screen.getByLabelText("Curve"), { target: { value: "log" } });
    expect(mappings()[0].target).toEqual({ type: "mixer-volume", value: "0", min: 0.1, max: 0.8, invert: true, curve: "log" });
    unmount();

    act(() => {
      AppStateStore.update((s) => {
        s.midiControlMappings = [
          {
            id: "m", name: "Switch mute", source: { type: "midi", kind: "cc", code: "64", channel: "any" },
            target: { type: "mixer-mute", value: "5", mode: "toggle", threshold: 64 },
          },
        ];
      });
    });
    render(<MidiMappingPanel />);
    expect(screen.getAllByText("Music mute").length).toBeGreaterThan(0);
    expect(screen.queryByLabelText("Curve")).toBeNull();
    const mode = screen.getByLabelText("Mode") as HTMLSelectElement;
    expect(Array.from(mode.options).map((o) => o.text)).toEqual([
      "Toggle mute on press",
      "Momentary (muted while held)",
      "Threshold (muted above value)",
    ]);
    fireEvent.change(mode, { target: { value: "threshold" } });
    fireEvent.change(screen.getByLabelText("Threshold"), { target: { value: "90" } });
    expect(mappings()[0].target).toEqual({ type: "mixer-mute", value: "5", mode: "threshold", threshold: 90 });
  });

  it("persists the listen to all inputs option", () => {
    render(<MidiMappingPanel />);
    persist.mockClear();
    fireEvent.click(screen.getByLabelText("Listen to all MIDI inputs"));
    expect(AppStateStore.getRawState().midiListenAllInputs).toBe(true);
    expect(persist).toHaveBeenCalled();
  });
});
