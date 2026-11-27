// @vitest-environment jsdom
import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "../../testing/componentTestSetup";
import { DeviceStateStore } from "../../stores/devicestate";
import { MixerStateStore, initialMixerState } from "../../stores/mixerstate";
import { MixerEvents, MixerViewModel } from "../../core/mixerViewModel";
import MixerPanel, { MIXER_WARNING } from "../device/mixer/mixer-panel";

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

const slider = (name: RegExp) => screen.getByRole("slider", { name });
const sets = () => events.invoke.mock.calls.map((c) => c[1]).filter((a) => a.action == "setMixerVolume");
const reads = () => events.invoke.mock.calls.map((c) => c[1]).filter((a) => a.action == "getMixerVolume");

/** Lets the view model's awaited perform-action calls settle. */
const settle = () => act(async () => {});

beforeEach(() => {
  act(() => {
    MixerStateStore.update((s) => Object.assign(s, initialMixerState()));
  });
  setConnected(true);
  events = new FakeEvents();
  vm = new MixerViewModel(events);
});

afterEach(() => {
  vm.dispose();
  setConnected(false);
});

describe("MixerPanel", () => {
  it("shows the experimental warning and three labelled sliders in the unknown state", async () => {
    render(<MixerPanel viewModel={vm} />);
    await settle();

    expect(screen.getByRole("heading", { name: "Amp mixer (experimental)" })).toBeInTheDocument();
    expect(screen.getByRole("note")).toHaveTextContent(MIXER_WARNING);

    for (const [name, channel] of [[/^guitar/i, 0], [/^music/i, 5], [/^master/i, 9]] as const) {
      const s = slider(name);
      expect(s).toHaveAttribute("min", "0");
      expect(s).toHaveAttribute("max", "100");
      // never at a loud default while the value is unknown
      expect(s).toHaveValue("0");
      expect(s).toHaveAttribute("aria-valuetext", "unknown");
      expect(screen.getByTestId(`mixer-value-${channel}`)).toHaveTextContent("—");
    }
  });

  it("only reads when it opens, it never sends a value by itself", async () => {
    render(<MixerPanel viewModel={vm} />);
    await settle();

    expect(reads().map((a) => a.data)).toEqual([0]);
    expect(sets()).toEqual([]);
  });

  it("shows values read from the amp", async () => {
    render(<MixerPanel viewModel={vm} />);
    await settle();

    events.emit("mixer-message", { type: "mixer_volume", value: 0.5 });
    await settle();

    expect(slider(/^guitar/i)).toHaveValue("50");
    expect(slider(/^guitar/i)).toHaveAttribute("aria-valuetext", "50 %");
    expect(screen.getByTestId("mixer-value-0")).toHaveTextContent("50 %");
    expect(screen.getByTestId("mixer-read-0")).toHaveTextContent("read 50 %");
    expect(screen.getByTestId("mixer-read-5")).toHaveTextContent("reading…");
  });

  it("shows no reply for a channel that did not answer", async () => {
    render(<MixerPanel viewModel={vm} />);
    act(() => {
      MixerStateStore.update((s) => {
        s.channels[9] = { value: null, readStatus: "no-reply" };
      });
    });

    expect(screen.getByTestId("mixer-read-9")).toHaveTextContent("no reply");
    expect(screen.getByTestId("mixer-value-9")).toHaveTextContent("—");
  });

  it("reads again with the Read from amp button", async () => {
    render(<MixerPanel viewModel={vm} />);
    await settle();
    // finish the read started on open
    for (const v of [0.1, 0.2, 0.3]) {
      events.emit("mixer-message", { type: "mixer_volume", value: v });
      await settle();
    }
    events.invoke.mockClear();

    fireEvent.click(screen.getByRole("button", { name: "Read from amp" }));
    await settle();

    expect(reads().map((a) => a.data)).toEqual([0]);
    expect(screen.getByRole("button", { name: "Reading…" })).toBeDisabled();
  });

  it("sends a slider change for that channel", async () => {
    render(<MixerPanel viewModel={vm} />);
    await settle();

    fireEvent.change(slider(/^music/i), { target: { value: "30" } });
    await settle();

    expect(sets()).toEqual([{ action: "setMixerVolume", data: { channel: 5, value: 0.3, trailingZero: null } }]);
    expect(screen.getByTestId("mixer-value-5")).toHaveTextContent("30 %");
  });

  it("steps 1 % with the arrow keys and 10 % with PageUp/PageDown, and ignores End", async () => {
    render(<MixerPanel viewModel={vm} />);
    await settle();
    const master = slider(/^master/i);

    fireEvent.keyDown(master, { key: "PageUp" });
    await settle();
    fireEvent.keyDown(master, { key: "ArrowUp" });
    await settle();
    fireEvent.keyDown(master, { key: "PageDown" });
    await settle();
    fireEvent.keyDown(master, { key: "ArrowRight" });
    await settle();
    fireEvent.keyDown(master, { key: "End" });
    await settle();

    expect(sets().map((a) => [a.data.channel, a.data.value])).toEqual([
      [9, 0.1],
      [9, 0.11],
      [9, 0.01],
      [9, 0.02],
    ]);
    fireEvent.keyUp(master, { key: "ArrowRight" });
    expect(master).toHaveValue("2");
  });

  it("keeps the user's value while dragging when the amp reports its input volume", async () => {
    render(<MixerPanel viewModel={vm} />);
    await settle();

    fireEvent.change(slider(/^guitar/i), { target: { value: "60" } });
    events.emit("mixer-message", { type: "input_volume", value: 0.2 });
    await settle();

    expect(slider(/^guitar/i)).toHaveValue("60");
    expect(screen.getByTestId("mixer-status")).toHaveTextContent(/03 6B\): 20 %/);
  });

  it("shows acks and input volume notifications in the status line", async () => {
    render(<MixerPanel viewModel={vm} />);
    await settle();
    expect(screen.getByTestId("mixer-status")).toHaveTextContent("Amp acks (04 33): 0");
    expect(screen.getByTestId("mixer-status")).toHaveTextContent("none yet");

    events.emit("mixer-message", { type: "mixer_ack", value: true });
    events.emit("mixer-message", { type: "mixer_ack", value: true });
    events.emit("mixer-message", { type: "input_volume", value: 0.45 });

    expect(screen.getByTestId("mixer-status")).toHaveTextContent(/Amp acks \(04 33\): 2, last at/);
    expect(screen.getByTestId("mixer-status")).toHaveTextContent(/45 % at/);
    expect(screen.getByTestId("mixer-value-0")).toHaveTextContent("45 %");
  });

  it("has an advanced trailing 0x00 checkbox that defaults to the model", async () => {
    render(<MixerPanel viewModel={vm} isSpark2 />);
    await settle();
    const checkbox = screen.getByRole("checkbox", { name: "Append 0x00 (Spark 2 style)" });

    expect(checkbox).toBeChecked();
    expect(screen.getByText(/default for this amp: on/)).toBeInTheDocument();

    fireEvent.click(checkbox);
    expect(checkbox).not.toBeChecked();
    expect(screen.getByText("set by you")).toBeInTheDocument();

    fireEvent.change(slider(/^guitar/i), { target: { value: "10" } });
    await settle();
    expect(sets()[0].data.trailingZero).toBe(false);
  });

  it("probes a custom channel from the advanced section", async () => {
    render(<MixerPanel viewModel={vm} />);
    await settle();

    fireEvent.change(screen.getByRole("spinbutton", { name: "Custom channel" }), { target: { value: "3" } });
    fireEvent.change(slider(/^custom/i), { target: { value: "15" } });
    await settle();

    expect(sets().map((a) => [a.data.channel, a.data.value])).toEqual([[3, 0.15]]);
    expect(screen.getByRole("button", { name: "Read ch 3" })).toBeInTheDocument();
  });

  it("lets the custom channel field be cleared and retyped", async () => {
    render(<MixerPanel viewModel={vm} />);
    await settle();
    const field = screen.getByRole("spinbutton", { name: "Custom channel" });

    fireEvent.change(field, { target: { value: "" } });
    expect(field).toHaveValue(null);
    fireEvent.change(field, { target: { value: "3" } });
    expect(field).toHaveValue(3);
    expect(screen.getByRole("button", { name: "Read ch 3" })).toBeInTheDocument();

    // out of range is not taken, and the field shows the channel in use again on blur
    fireEvent.change(field, { target: { value: "40" } });
    expect(screen.getByRole("button", { name: "Read ch 3" })).toBeInTheDocument();
    fireEvent.blur(field);
    expect(field).toHaveValue(3);

    fireEvent.change(slider(/^custom/i), { target: { value: "15" } });
    await settle();
    expect(sets().map((a) => [a.data.channel, a.data.value])).toEqual([[3, 0.15]]);
  });

  it("drops a drag cut short by a disconnect and shows the value read after reconnecting", async () => {
    render(<MixerPanel viewModel={vm} />);
    await settle();
    for (const v of [0.1, 0.2, 0.3]) {
      events.emit("mixer-message", { type: "mixer_volume", value: v });
      await settle();
    }

    // drag guitar to 80 %, then the link drops before pointerup
    fireEvent.change(slider(/^guitar/i), { target: { value: "80" } });
    await settle();
    setConnected(false);
    await settle();

    expect(slider(/^guitar/i)).toBeDisabled();
    expect(screen.getByTestId("mixer-value-0")).toHaveTextContent("—");

    setConnected(true);
    await settle();
    events.emit("mixer-message", { type: "mixer_volume", value: 0.1 });
    await settle();

    expect(screen.getByTestId("mixer-value-0")).toHaveTextContent("10 %");
    events.invoke.mockClear();
    fireEvent.keyDown(slider(/^guitar/i), { key: "ArrowUp" });
    await settle();
    expect(sets().map((a) => [a.data.channel, a.data.value])).toEqual([[0, 0.11]]);
  });

  it("says when a read may be a late reply", async () => {
    render(<MixerPanel viewModel={vm} />);
    act(() => {
      MixerStateStore.update((s) => {
        s.channels[5] = { value: 0.4, lastReadValue: 0.4, readStatus: "ok", readUncertain: true };
      });
    });

    expect(screen.getByTestId("mixer-read-5")).toHaveTextContent("read 40 % (may be a late reply)");
  });

  it("is disabled while no amp is connected", async () => {
    setConnected(false);
    render(<MixerPanel viewModel={vm} />);
    await settle();

    expect(screen.getByText("Connect an amp to use the mixer.")).toBeInTheDocument();
    expect(slider(/^guitar/i)).toBeDisabled();
    expect(slider(/^music/i)).toBeDisabled();
    expect(slider(/^master/i)).toBeDisabled();
    expect(screen.getByRole("button", { name: "Read from amp" })).toBeDisabled();
    expect(screen.getByRole("checkbox", { name: "Append 0x00 (Spark 2 style)" })).toBeDisabled();
    expect(events.invoke).not.toHaveBeenCalled();
  });

  it("shows errors from the view model", async () => {
    events.invoke.mockResolvedValue(false);
    render(<MixerPanel viewModel={vm} />);
    await settle();

    expect(screen.getByRole("alert")).toHaveTextContent(/could not send the mixer read request/i);
  });
});
