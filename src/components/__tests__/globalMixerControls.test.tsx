// @vitest-environment jsdom
import React from "react";
import { act, createEvent, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "../../testing/componentTestSetup";
import { DeviceStateStore } from "../../stores/devicestate";
import { MixerStateStore, initialMixerState } from "../../stores/mixerstate";
import { MixerEvents, MixerViewModel } from "../../core/mixerViewModel";
import { midiMappingController } from "../../core/midiMappingController";
import { AppStateStore } from "../../stores/appstate";
import { MidiStateStore } from "../../stores/midistate";
import { InputEventMapping } from "../../spork/src/interfaces/inputEventMapping";
import GlobalMixerControls from "../device/mixer/global-mixer-controls";

class FakeEvents implements MixerEvents {
  handlers = new Map<string, (event: any, args: any) => any>();
  invoke = vi.fn(async (_type: string, _data: any): Promise<any> => true);
  on(type: string, action: (event: any, args: any) => any) {
    this.handlers.set(type, action);
  }
  emit(type: string, args: any) {
    act(() => {
      this.handlers.get(type)?.(type, args);
    });
  }
}

let events: FakeEvents;
let vm: MixerViewModel;

const setConnected = (connected: boolean) =>
  act(() => {
    DeviceStateStore.update((s) => {
      s.isConnected = connected;
    });
  });

const setChannel = (channel: number, value: number | null) =>
  act(() => {
    MixerStateStore.update((s) => {
      s.channels[channel] = { value, readStatus: value == null ? "idle" : "ok" };
    });
  });

const knob = (name: string) => screen.getByRole("slider", { name });
const muteButton = (name: string) => screen.getByRole("button", { name });
const sets = () =>
  events.invoke.mock.calls
    .map((c) => c[1])
    .filter((a) => a.action == "setMixerVolume")
    .map((a) => [a.data.channel, a.data.value]);

/** Lets the view model's awaited perform-action calls settle. */
const settle = () => act(async () => {});

beforeEach(() => {
  act(() => {
    MixerStateStore.update((s) => Object.assign(s, initialMixerState()));
  });
  setConnected(true);
  events = new FakeEvents();
  // connected already, so constructing it does not start a read
  vm = new MixerViewModel(events);
});

afterEach(() => {
  vm.dispose();
  setConnected(false);
});

describe("GlobalMixerControls", () => {
  it("renders nothing while no amp is connected", () => {
    setConnected(false);
    const { container } = render(<GlobalMixerControls viewModel={vm} />);

    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByRole("slider")).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("appears when an amp connects and goes away when it disconnects", () => {
    setConnected(false);
    render(<GlobalMixerControls viewModel={vm} />);

    setConnected(true);
    expect(screen.getByRole("group", { name: "Amp volume" })).toBeInTheDocument();

    setConnected(false);
    expect(screen.queryByRole("group", { name: "Amp volume" })).toBeNull();
  });

  it("has a named knob and mute button for Guitar and Music, showing — while unknown", () => {
    render(<GlobalMixerControls viewModel={vm} />);

    for (const [label, channel] of [["Guitar", 0], ["Music", 5]] as const) {
      const k = knob(`${label} volume`);
      expect(k).toHaveAttribute("aria-valuetext", "unknown");
      // never at a loud default while the value is unknown
      expect(k).toHaveAttribute("aria-valuenow", "0");
      expect(screen.getByTestId(`nav-mixer-value-${channel}`)).toHaveTextContent("—");
      expect(screen.getByTestId(`nav-mixer-${channel}`)).toHaveTextContent(label);

      const mute = muteButton(`Mute ${label.toLowerCase()}`);
      expect(mute).toHaveAttribute("aria-pressed", "false");
      expect(mute).toHaveAttribute("title");
    }
    expect(screen.queryByRole("slider", { name: /master/i })).toBeNull();
  });

  it("shows the amp's levels as percentages", () => {
    render(<GlobalMixerControls viewModel={vm} />);

    setChannel(0, 0.42);
    setChannel(5, 1);

    expect(screen.getByTestId("nav-mixer-value-0")).toHaveTextContent("42 %");
    expect(knob("Guitar volume")).toHaveAttribute("aria-valuetext", "42 %");
    expect(knob("Guitar volume")).toHaveAttribute("aria-valuenow", "0.42");
    expect(screen.getByTestId("nav-mixer-value-5")).toHaveTextContent("100 %");
  });

  it("sends knob changes through the view model", async () => {
    const setVolume = vi.spyOn(vm, "setVolume");
    render(<GlobalMixerControls viewModel={vm} />);
    setChannel(5, 0.5);

    fireEvent.keyDown(knob("Music volume"), { key: "ArrowUp" });
    await settle();

    expect(setVolume).toHaveBeenCalledWith(5, 0.51);
    expect(sets()).toEqual([[5, 0.51]]);
    expect(screen.getByTestId("nav-mixer-value-5")).toHaveTextContent("51 %");
  });

  it("ignores End, so a stray key press never jumps to full volume", async () => {
    render(<GlobalMixerControls viewModel={vm} />);
    setChannel(0, 0.3);

    fireEvent.keyDown(knob("Guitar volume"), { key: "End" });
    await settle();

    expect(sets()).toEqual([]);
    expect(knob("Guitar volume")).toHaveAttribute("aria-valuenow", "0.3");
  });

  it("sends a drag's live values and does not repeat the last one on release", async () => {
    render(<GlobalMixerControls viewModel={vm} />);
    setChannel(0, 0.5);
    const k = knob("Guitar volume");

    fireEvent.pointerDown(k, { pointerId: 1, button: 0, clientY: 100 });
    fireEvent.pointerMove(k, { pointerId: 1, clientY: 80 });
    fireEvent.pointerUp(k, { pointerId: 1, clientY: 80 });
    await settle();

    // 20 px of NAV_KNOB_DRAG_RANGE_PX (100)
    expect(sets()).toEqual([[0, 0.7]]);
  });

  it("raises the level with a rightward drag, as there is little room above the nav", async () => {
    render(<GlobalMixerControls viewModel={vm} />);
    setChannel(5, 0);
    const k = knob("Music volume");

    fireEvent.pointerDown(k, { pointerId: 1, button: 0, clientX: 100, clientY: 20 });
    fireEvent.pointerMove(k, { pointerId: 1, clientX: 160, clientY: 20 });
    fireEvent.pointerUp(k, { pointerId: 1, clientX: 160, clientY: 20 });
    await settle();

    expect(sets()).toEqual([[5, 0.6]]);
  });

  it("undoes a mute that did not reach the amp and says so on the channel", async () => {
    render(<GlobalMixerControls viewModel={vm} />);
    setChannel(0, 0.6);
    events.invoke.mockResolvedValueOnce(false);

    fireEvent.click(muteButton("Mute guitar"));
    await settle();

    expect(sets()).toEqual([[0, 0]]);
    expect(muteButton("Mute guitar")).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByTestId("nav-mixer-value-0")).toHaveTextContent("60 %");
    const channel = screen.getByTestId("nav-mixer-0");
    expect(channel).toHaveClass("is-error");
    expect(channel).not.toHaveClass("is-muted");
    expect(channel.getAttribute("title")).toMatch(/did not reach the amp/);
    expect(muteButton("Mute guitar").getAttribute("title")).toMatch(/did not reach the amp/);
    expect(screen.getByTestId("nav-mixer-error-0")).toHaveTextContent(/Guitar: the last change did not reach the amp/);
    expect(screen.getByTestId("nav-mixer-error-5")).toBeEmptyDOMElement();

    // the next set that gets through clears it
    fireEvent.click(muteButton("Mute guitar"));
    await settle();
    expect(muteButton("Mute guitar")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("nav-mixer-0")).not.toHaveClass("is-error");
    expect(screen.getByTestId("nav-mixer-error-0")).toBeEmptyDOMElement();
  });

  it("mutes and unmutes through the view model, showing the remembered level dimmed", async () => {
    const toggleMute = vi.spyOn(vm, "toggleMute");
    render(<GlobalMixerControls viewModel={vm} />);
    setChannel(0, 0.5);

    fireEvent.click(muteButton("Mute guitar"));
    await settle();

    expect(toggleMute).toHaveBeenCalledWith(0);
    expect(sets()).toEqual([[0, 0]]);
    expect(muteButton("Mute guitar")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("nav-mixer-0")).toHaveClass("is-muted");
    // the knob keeps the level unmuting goes back to
    expect(knob("Guitar volume")).toHaveAttribute("aria-valuetext", "50 % (muted)");
    expect(screen.getByTestId("nav-mixer-value-0")).toHaveTextContent("50 %");
    // Music is unaffected
    expect(muteButton("Mute music")).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(muteButton("Mute guitar"));
    await settle();

    expect(sets()).toEqual([
      [0, 0],
      [0, 0.5],
    ]);
    expect(muteButton("Mute guitar")).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByTestId("nav-mixer-0")).not.toHaveClass("is-muted");
  });

  it("turning a muted knob unmutes it at the new level", async () => {
    render(<GlobalMixerControls viewModel={vm} />);
    setChannel(5, 0.4);
    fireEvent.click(muteButton("Mute music"));
    await settle();

    fireEvent.keyDown(knob("Music volume"), { key: "ArrowDown" });
    await settle();

    expect(sets()).toEqual([
      [5, 0],
      [5, 0.39],
    ]);
    expect(muteButton("Mute music")).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByTestId("nav-mixer-value-5")).toHaveTextContent("39 %");
  });

  it("clears the mute when the amp reports a guitar level", async () => {
    render(<GlobalMixerControls viewModel={vm} />);
    setChannel(0, 0.5);
    fireEvent.click(muteButton("Mute guitar"));
    await settle();

    events.emit("mixer-message", { type: "input_volume", value: 0.25 });

    expect(muteButton("Mute guitar")).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByTestId("nav-mixer-value-0")).toHaveTextContent("25 %");
  });
});

describe("GlobalMixerControls MIDI learn", () => {
  const persist = vi.fn();
  const mappings = () => AppStateStore.getRawState().midiControlMappings as InputEventMapping[];
  const learning = () => MidiStateStore.getRawState().learningMappingIds;
  const ccFrom = (number: number, rawValue: number) => ({
    type: "controlchange", controller: { number }, rawValue, value: rawValue / 127,
    message: { channel: 1, dataBytes: [number, rawValue] }, port: { name: "Pedal" },
  });

  beforeEach(() => {
    midiMappingController.attach(
      {
        setChannel: vi.fn().mockResolvedValue(true),
        requestFxParamChangeImmediate: vi.fn().mockResolvedValue(true),
        requestFxToggle: vi.fn().mockResolvedValue(true),
      },
      persist
    );
    act(() => {
      AppStateStore.update((s) => {
        s.inputEventMappings = [];
        s.midiControlMappings = [];
        s.isMidiInputAvailable = true;
      });
      MidiStateStore.update((s) => {
        s.learningMappingIds = [];
        s.learnStatus = null;
      });
    });
  });

  afterEach(() => {
    act(() => midiMappingController.cancelLearn());
  });

  it("learns a MIDI control for the guitar knob from its right-click menu", () => {
    render(<GlobalMixerControls viewModel={vm} />);
    fireEvent.contextMenu(knob("Guitar volume"));

    const menu = screen.getByRole("menu", { name: "MIDI learn: Guitar volume" });
    expect(menu).toHaveTextContent("Not mapped");
    expect(screen.getByRole("menuitem", { name: "Clear" })).toBeDisabled();
    fireEvent.click(screen.getByRole("menuitem", { name: "Learn" }));

    expect(screen.queryByRole("menu")).toBeNull();
    expect(mappings()).toHaveLength(1);
    expect(mappings()[0]).toMatchObject({
      name: "MIDI → Guitar volume",
      target: { type: "mixer-volume", value: "0", min: 0, max: 1, invert: false, curve: "linear" },
    });
    expect(learning()).toEqual([mappings()[0].id]);
    expect(screen.getByTestId("nav-mixer-knob-0")).toHaveClass("is-learning");
    expect(screen.getByTestId("nav-mixer-learn-status-0")).toHaveTextContent(/Guitar volume: move a control/);
    expect(screen.getByTestId("nav-mixer-learn-status-5")).toHaveTextContent("");

    act(() => {
      midiMappingController.handleMidiEvent(ccFrom(7, 20));
    });
    expect(learning()).toEqual([]);
    expect(screen.getByTestId("nav-mixer-knob-0")).not.toHaveClass("is-learning");
    expect(mappings()[0].source).toMatchObject({ kind: "cc", code: "7" });
    // learning sent nothing to the amp
    expect(sets()).toEqual([]);

    fireEvent.contextMenu(knob("Guitar volume"));
    expect(screen.getByRole("menu")).toHaveTextContent("CC 7 · ch 1 · Pedal");
    fireEvent.click(screen.getByRole("menuitem", { name: "Clear" }));
    expect(mappings()).toEqual([]);
  });

  it("learns a MIDI control for the music mute button", () => {
    render(<GlobalMixerControls viewModel={vm} />);
    fireEvent.contextMenu(muteButton("Mute music"));
    fireEvent.click(screen.getByRole("menuitem", { name: "Learn" }));

    expect(mappings()[0]).toMatchObject({ name: "MIDI → Music mute", target: { type: "mixer-mute", value: "5", mode: "toggle" } });
    expect(muteButton("Mute music")).toHaveClass("is-learning");
    expect(muteButton("Mute music")).toHaveAttribute("title", "Music mute: listening for MIDI…");

    // the menu offers to cancel while learning; cancelling removes the unlearned mapping
    fireEvent.contextMenu(muteButton("Mute music"));
    fireEvent.click(screen.getByRole("menuitem", { name: "Cancel learn" }));
    expect(learning()).toEqual([]);
    expect(mappings()).toEqual([]);
    expect(muteButton("Mute music")).not.toHaveClass("is-learning");
    // the right-click never toggled the mute
    expect(muteButton("Mute music")).toHaveAttribute("aria-pressed", "false");
    expect(sets()).toEqual([]);
  });

  it("opens with Shift+F10 and closes with Escape, back on the control", () => {
    render(<GlobalMixerControls viewModel={vm} />);
    const button = muteButton("Mute guitar");
    button.focus();
    // F10 alone does nothing
    fireEvent.keyDown(button, { key: "F10" });
    expect(screen.queryByRole("menu")).toBeNull();
    const event = createEvent.keyDown(button, { key: "F10", shiftKey: true });
    fireEvent(button, event);
    expect(event.defaultPrevented).toBe(true);

    expect(screen.getByRole("menuitem", { name: "Learn" })).toHaveFocus();
    fireEvent.keyDown(screen.getByRole("menu"), { key: "ArrowDown" });
    expect(screen.getByRole("menuitem", { name: "Close" })).toHaveFocus();
    fireEvent.keyDown(screen.getByRole("menu"), { key: "Escape" });
    expect(screen.queryByRole("menu")).toBeNull();
    expect(button).toHaveFocus();
    expect(mappings()).toEqual([]);
  });

  it("opens from the knob with the context menu key, back on the dial", () => {
    render(<GlobalMixerControls viewModel={vm} />);
    const dial = knob("Guitar volume");
    dial.focus();
    fireEvent.keyDown(dial, { key: "ContextMenu" });
    expect(screen.getByRole("menu", { name: "MIDI learn: Guitar volume" })).toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole("menu"), { key: "Escape" });
    expect(dial).toHaveFocus();
    // the knob's own keys still work and don't open the menu
    fireEvent.keyDown(dial, { key: "ArrowUp" });
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("tells hover and screen reader users about the learn menu on the dial and the mute button", () => {
    render(<GlobalMixerControls viewModel={vm} />);
    const dial = knob("Guitar volume");
    expect(dial.getAttribute("title")).toMatch(/Right-click or Shift\+F10 for MIDI learn$/);
    expect(muteButton("Mute guitar").getAttribute("title")).toMatch(/\(right-click or Shift\+F10 for MIDI learn\)$/);
    for (const el of [dial, muteButton("Mute guitar")]) {
      const id = el.getAttribute("aria-describedby");
      expect(id).toBeTruthy();
      expect(document.getElementById(id!)).toHaveTextContent("Right-click or press Shift+F10 for the MIDI learn menu.");
    }

    act(() => {
      midiMappingController.learnMixerTarget("mixer-volume", 0);
    });
    expect(dial.getAttribute("title")).toMatch(/Listening for MIDI…$/);
  });

  it("re-learning from the menu re-assigns the control instead of adding a mapping", () => {
    render(<GlobalMixerControls viewModel={vm} />);
    for (const code of [80, 80, 81]) {
      fireEvent.contextMenu(muteButton("Mute music"));
      fireEvent.click(screen.getByRole("menuitem", { name: "Learn" }));
      act(() => {
        midiMappingController.handleMidiEvent(ccFrom(code, 127));
      });
    }
    expect(mappings()).toHaveLength(1);
    expect(mappings()[0].source).toMatchObject({ kind: "cc", code: "81" });
  });

  it("closes on a click outside", () => {
    render(<GlobalMixerControls viewModel={vm} />);
    fireEvent.contextMenu(knob("Music volume"));
    expect(screen.getByRole("menu", { name: "MIDI learn: Music volume" })).toBeInTheDocument();
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole("menu")).toBeNull();
  });
});
