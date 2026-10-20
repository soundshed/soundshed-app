// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { DeviceViewModel } from "../deviceViewModel";
import { DeviceStateStore } from "../../stores/devicestate";
import { platformEvents } from "../platformUtils";

// Reported from real use: after a failed connection the app could not connect to
// the amp again until the page was reloaded.
//
// deviceConnectionFailed was set on failure and never cleared. While it was set the
// device selector replaced the device list — including every Connect button — with
// an error message, so there was nothing left to press.

const AMP = { name: "Spark 2 BLE", address: "amp-1", port: null };

function viewModelWithConnectResults(...results: Array<boolean | Error>) {
    const vm = new DeviceViewModel();
    const connect = vi.fn();
    for (const r of results) {
        if (r instanceof Error) connect.mockRejectedValueOnce(r);
        else connect.mockResolvedValueOnce(r);
    }
    (vm as any).deviceContext = { deviceManager: { connect } };
    return { vm, connect };
}

const failed = () => DeviceStateStore.getRawState().deviceConnectionFailed;

describe("recovering from a failed connection", () => {
    beforeEach(() => {
        vi.spyOn(platformEvents, "invoke").mockResolvedValue(true as any);
        DeviceStateStore.update(s => {
            s.isConnected = false;
            s.isConnectionInProgress = false;
            s.deviceConnectionFailed = false;
            s.deviceScanFailed = false;
            s.lastAttemptedDevice = null;
            // Skip the wait-for-channel loop on a successful connect.
            s.selectedChannel = 0;
        });
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("records the failure", async () => {
        const { vm } = viewModelWithConnectResults(false);

        await vm.connectDevice(AMP);

        expect(failed()).toBe(true);
    });

    it("clears the failure as soon as a new attempt starts", async () => {
        const { vm, connect } = viewModelWithConnectResults(false);
        await vm.connectDevice(AMP);

        let failedDuringRetry: boolean | undefined;
        connect.mockImplementationOnce(async () => {
            failedDuringRetry = failed();
            return true;
        });
        await vm.connectDevice(AMP);

        expect(failedDuringRetry).toBe(false);
    });

    it("clears the failure once a retry connects", async () => {
        const { vm } = viewModelWithConnectResults(false, true);
        await vm.connectDevice(AMP);

        const ok = await vm.connectDevice(AMP);

        expect(ok).toBe(true);
        expect(failed()).toBe(false);
        expect(DeviceStateStore.getRawState().isConnected).toBe(true);
    });

    it("recovers after a connection attempt that threw", async () => {
        const { vm } = viewModelWithConnectResults(new Error("NetworkError"), true);
        await vm.connectDevice(AMP);
        expect(failed()).toBe(true);

        await vm.connectDevice(AMP);

        expect(failed()).toBe(false);
    });

    it("clears the failure when the user scans again", async () => {
        const { vm } = viewModelWithConnectResults(false);
        await vm.connectDevice(AMP);

        await vm.scanForDevices();

        expect(failed()).toBe(false);
    });
});
