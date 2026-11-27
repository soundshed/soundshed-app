// @vitest-environment jsdom
import React from "react";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import "../../testing/componentTestSetup";
import { DeviceStateStore } from "../../stores/devicestate";
import { initialLooperState, LooperStateStore } from "../../stores/looperstate";
import { DEFAULT_LOOPER_SETTINGS, LooperCommand } from "../../spork/src/devices/spark/sparkLooper";

const fakeDevice = vi.hoisted(() => ({
  onStateChanged: null as any,
  spark2: false,
  sent: [] as number[],
  settingsSent: [] as any[],
  stateRequests: 0,
  async sendLooperCommand(command: number) {
    this.sent.push(command);
  },
  async updateLooperSettings(settings: any) {
    this.settingsSent.push(settings);
  },
  async requestLooperState() {
    this.stateRequests++;
  },
  isSpark2Device() {
    return this.spark2;
  },
}));

// The panel takes the device manager from components/app, which would pull in the
// whole application on import.
vi.mock("../app", () => ({
  deviceViewModel: { deviceContext: { deviceManager: fakeDevice } },
}));

import LooperPanel from "../device/looper/looper-panel";

const setDevice = (patch: Record<string, any>) =>
  act(() => DeviceStateStore.update((s) => Object.assign(s, patch)));

const setLooper = (patch: Record<string, any>) =>
  act(() => LooperStateStore.update((s) => Object.assign(s, patch)));

const button = (name: RegExp | string) => screen.getByRole("button", { name });

describe("LooperPanel", () => {
  beforeEach(() => {
    fakeDevice.spark2 = false;
    fakeDevice.sent = [];
    fakeDevice.settingsSent = [];
    fakeDevice.stateRequests = 0;
    LooperStateStore.update((s) => Object.assign(s, initialLooperState()));
    DeviceStateStore.update((s) => Object.assign(s, { isConnected: false, connectedDevice: null }));
  });

  it("asks for a Spark 2 while disconnected", () => {
    render(<LooperPanel />);

    expect(screen.getByText(/connect a spark 2/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Rec" })).toBeNull();
  });

  it("is not offered on other Spark models", () => {
    setDevice({ isConnected: true, connectedDevice: { name: "Spark 40 Audio", address: "a" } });
    render(<LooperPanel />);

    expect(screen.getByText(/only available on spark 2/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Rec" })).toBeNull();
  });

  it("is available with a note when the model is unknown", () => {
    setDevice({ isConnected: true, connectedDevice: { name: "", address: "a" } });
    render(<LooperPanel />);

    expect(screen.getByText(/could not be identified/i)).toBeInTheDocument();
    expect(button("Rec")).toBeEnabled();
  });

  it("reads the looper state when a Spark 2 is connected", async () => {
    setDevice({ isConnected: true, connectedDevice: { name: "Spark 2 BLE", address: "a" } });
    render(<LooperPanel />);

    await act(async () => {});
    expect(fakeDevice.stateRequests).toBeGreaterThan(0);
    expect(screen.queryByText(/could not be identified/i)).toBeNull();
  });

  it("labels the transport from the looper state", () => {
    setDevice({ isConnected: true, connectedDevice: { name: "Spark 2", address: "a" } });
    render(<LooperPanel />);

    expect(button("Rec")).toBeInTheDocument();
    expect(button("Play")).toBeDisabled();
    expect(button("Undo")).toBeDisabled();
    expect(screen.getByTestId("looper-status")).toHaveTextContent("Empty");

    setLooper({ hasLoop: true, isPlaying: true, canRedo: true, loopCount: 2, measure: 0.5, settings: DEFAULT_LOOPER_SETTINGS });

    expect(button("Dub")).toBeInTheDocument();
    expect(button("Stop")).toBeEnabled();
    expect(button("Redo")).toBeEnabled();
    expect(screen.getByTestId("looper-status")).toHaveTextContent("Playing");
    expect(screen.getByTestId("looper-position")).toHaveTextContent("Bar 3/4 · Beat 1");
    expect(screen.getByText("Loops: 2")).toBeInTheDocument();
  });

  it("sends transport commands from the buttons", async () => {
    const user = userEvent.setup();
    setDevice({ isConnected: true, connectedDevice: { name: "Spark 2", address: "a" } });
    setLooper({ hasLoop: true });
    render(<LooperPanel />);

    await user.click(button("Play"));
    expect(fakeDevice.sent).toEqual([LooperCommand.Play]);
    expect(button("Stop")).toBeInTheDocument();
  });

  it("applies the settings form", async () => {
    const user = userEvent.setup();
    setDevice({ isConnected: true, connectedDevice: { name: "Spark 2", address: "a" } });
    setLooper({ settings: DEFAULT_LOOPER_SETTINGS, ampBpm: 132.4 });
    render(<LooperPanel />);

    await user.click(button(/use amp tempo \(132\)/i));
    await user.selectOptions(screen.getByRole("combobox", { name: /bars/i }), "8");
    await user.click(screen.getByRole("checkbox", { name: /click/i }));
    await user.click(button("Apply"));

    expect(fakeDevice.settingsSent).toEqual([
      { ...DEFAULT_LOOPER_SETTINGS, bpm: 132, bars: 8, click: false },
    ]);
  });
});
