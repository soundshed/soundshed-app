// @vitest-environment jsdom
import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "../../testing/componentTestSetup";
import { DeviceStateStore } from "../../stores/devicestate";
import { MixerStateStore, initialMixerState } from "../../stores/mixerstate";
import { MixerEvents, MixerViewModel } from "../../core/mixerViewModel";
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
