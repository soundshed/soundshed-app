// @vitest-environment jsdom
import React from "react";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import "../../testing/componentTestSetup";
import { DeviceStateStore } from "../../stores/devicestate";

const connectDevice = vi.fn();

// device-selector.tsx pulls deviceViewModel from components/app, which would drag
// in the whole application on import.
vi.mock("../app", () => ({
  deviceViewModel: {
    connectDevice: (...args: any[]) => connectDevice(...args),
    scanForDevices: vi.fn(),
    getLastConnectedDevice: () => null,
  },
}));

import DeviceSelectorControl from "../device/device-selector";

const AMP = { name: "Spark 2 BLE", address: "amp-1", port: null };

const setState = (patch: Record<string, any>) =>
  act(() => DeviceStateStore.update((s) => Object.assign(s, patch)));

const connectButton = () =>
  screen.queryByRole("button", { name: /connect to spark 2 ble/i });

describe("device selector after a failed connection", () => {
  beforeEach(() => {
    connectDevice.mockReset();
    connectDevice.mockResolvedValue(true);
    setState({
      devices: [AMP],
      isConnected: false,
      isConnectionInProgress: false,
      isDeviceScanInProgress: false,
      deviceScanFailed: false,
      deviceConnectionFailed: false,
      lastAttemptedDevice: null,
    });
  });

  // Reported from real use: after a failure the app could not reconnect until the
  // page was reloaded, because the error message replaced the device list and took
  // every Connect button with it.
  it("keeps the Connect button available so the user can retry", () => {
    render(<DeviceSelectorControl />);
    setState({ deviceConnectionFailed: true });

    expect(connectButton()).not.toBeNull();
  });

  it("still shows why the last attempt failed", () => {
    render(<DeviceSelectorControl />);
    setState({ deviceConnectionFailed: true });

    expect(screen.getByRole("alert")).toHaveTextContent(/failed to connect/i);
  });

  it("retries the connection when Connect is pressed after a failure", async () => {
    const user = userEvent.setup();
    render(<DeviceSelectorControl />);
    setState({ deviceConnectionFailed: true });

    await user.click(connectButton()!);

    expect(connectDevice).toHaveBeenCalledWith(expect.objectContaining({ address: "amp-1" }));
  });

  it("shows no failure message before anything has failed", () => {
    render(<DeviceSelectorControl />);

    expect(screen.queryByRole("alert")).toBeNull();
    expect(connectButton()).not.toBeNull();
  });
});
