// @vitest-environment jsdom
import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import "../../testing/componentTestSetup";
import { DeviceStateStore } from "../../stores/devicestate";
import { TunerStateStore, initialTunerState } from "../../stores/tunerstate";
import { TunerEvents, TunerViewModel } from "../../core/tunerViewModel";
import TunerPanel from "../device/tuner/tuner-panel";

class FakeEvents implements TunerEvents {
  handlers = new Map<string, (event: any, args: any) => any>();
  invoke = vi.fn(async (): Promise<any> => true);
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
let vm: TunerViewModel;

const toggleButton = () => screen.getByRole("button", { name: /tuner/i });

beforeEach(() => {
  act(() => {
    TunerStateStore.update((s) => Object.assign(s, initialTunerState()));
    DeviceStateStore.update((s) => {
      s.isConnected = true;
    });
  });
  events = new FakeEvents();
  vm = new TunerViewModel(events);
});

describe("TunerPanel", () => {
  it("starts off with no reading shown", () => {
    render(<TunerPanel viewModel={vm} />);

    expect(toggleButton()).toHaveTextContent("Tuner Off");
    expect(toggleButton()).toHaveAttribute("aria-pressed", "false");
    expect(screen.queryByRole("meter")).toBeNull();
  });

  it("switches the amp's tuner on when the button is pressed", async () => {
    render(<TunerPanel viewModel={vm} />);

    await act(async () => {
      fireEvent.click(toggleButton());
    });

    expect(events.invoke).toHaveBeenCalledWith("perform-action", { action: "setTuner", data: true });
    expect(toggleButton()).toHaveTextContent("Tuner On");
    expect(toggleButton()).toHaveAttribute("aria-pressed", "true");
  });

  it("shows the note, offset and in-tune indicator from amp readings", () => {
    render(<TunerPanel viewModel={vm} />);

    events.emit("tuner-message", { type: "tuner_onoff", enabled: true });
    events.emit("tuner-message", { type: "tuner_output", note: 9, offset: 0.5 });

    expect(screen.getByTestId("tuner-note")).toHaveTextContent("A");
    expect(screen.getByTestId("tuner-status")).toHaveTextContent("In tune");
    expect(screen.getByRole("meter")).toHaveAttribute("aria-valuenow", "0");
    expect(screen.getByTestId("tuner-needle").style.left).toBe("calc(50% - 2px)");

    events.emit("tuner-message", { type: "tuner_output", note: 4, offset: 0.3 });

    expect(screen.getByTestId("tuner-note")).toHaveTextContent("E");
    expect(screen.getByTestId("tuner-cents")).toHaveTextContent("-20");
    expect(screen.getByTestId("tuner-status")).toHaveTextContent("Flat");
    expect(screen.getByTestId("tuner-needle").style.left).toBe("calc(30% - 2px)");
  });

  it("reflects the tuner being switched off at the amp", () => {
    render(<TunerPanel viewModel={vm} />);

    events.emit("tuner-message", { type: "tuner_onoff", enabled: true });
    expect(toggleButton()).toHaveTextContent("Tuner On");

    events.emit("tuner-message", { type: "tuner_onoff", enabled: false });
    expect(toggleButton()).toHaveTextContent("Tuner Off");
    expect(screen.queryByRole("meter")).toBeNull();
  });

  it("shows no note when the amp reports nothing detected", () => {
    render(<TunerPanel viewModel={vm} />);

    events.emit("tuner-message", { type: "tuner_output", note: 0x0e, offset: 0.5 });

    expect(screen.getByTestId("tuner-status")).toHaveTextContent("No note");
    expect(screen.queryByTestId("tuner-needle")).toBeNull();
  });

  it("is disabled and reset while no amp is connected", () => {
    render(<TunerPanel viewModel={vm} />);
    events.emit("tuner-message", { type: "tuner_onoff", enabled: true });

    act(() => {
      DeviceStateStore.update((s) => {
        s.isConnected = false;
      });
    });

    expect(toggleButton()).toBeDisabled();
    expect(toggleButton()).toHaveTextContent("Tuner Off");
  });
});
