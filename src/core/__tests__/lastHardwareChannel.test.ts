import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { DeviceViewModel } from "../deviceViewModel";
import { DeviceStateStore } from "../../stores/devicestate";
import { AppStateStore } from "../../stores/appstate";
import { VIRTUAL_CHANNEL } from "../sparkChannels";
import { platformEvents } from "../platformUtils";

// Save to Amp defaults to the last hardware channel while an applied tone is live on
// the virtual channel. That used to live in the amp screen's local state, which started
// again at channel 1 whenever the screen was left and reopened.

describe("last hardware channel", () => {
    let vm: any;
    let handlers: Record<string, (event: any, args: any) => void>;

    beforeEach(() => {
        vi.useFakeTimers();
        handlers = {};
        vi.spyOn(platformEvents, "on").mockImplementation((type: string, handler: any) => {
            handlers[type] = handler;
            return platformEvents as any;
        });
        vi.spyOn(platformEvents, "invoke").mockResolvedValue(true as any);

        vm = new DeviceViewModel();
        vm.setupEventListeners();

        AppStateStore.update(s => { s.numPresetSlots = 4; });
        DeviceStateStore.update(s => {
            s.selectedChannel = -1;
            s.lastHardwareChannel = null;
            s.presetTone = { name: "Start", fx: [] } as any;
        });
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    function sendChannelReport(presetNumber: number) {
        handlers["device-state-changed"]?.(null, {
            message: { type: "hardware_channel_current", presetNumber }
        });
    }

    async function setChannel(channel: number) {
        const done = vm.setChannel(channel);
        await vi.advanceTimersByTimeAsync(200);
        return done;
    }

    it("is unknown until a hardware channel is selected", () => {
        expect(DeviceStateStore.getRawState().lastHardwareChannel).toBeNull();
    });

    it("follows a channel chosen in the app", async () => {
        await expect(setChannel(2)).resolves.toBe(true);

        expect(DeviceStateStore.getRawState().selectedChannel).toBe(2);
        expect(DeviceStateStore.getRawState().lastHardwareChannel).toBe(2);
    });

    it("follows a channel the amp reports", () => {
        sendChannelReport(3);

        expect(DeviceStateStore.getRawState().lastHardwareChannel).toBe(3);
    });

    it("keeps the hardware channel when an applied tone moves to the virtual channel", async () => {
        await setChannel(2);

        await vm.requestPresetChange({ name: "Applied", fx: [] } as any);

        expect(DeviceStateStore.getRawState().selectedChannel).toBe(VIRTUAL_CHANNEL);
        expect(DeviceStateStore.getRawState().lastHardwareChannel).toBe(2);
    });

    it("is not replaced by the amp reporting the virtual channel or an out-of-range slot", () => {
        sendChannelReport(1);
        sendChannelReport(VIRTUAL_CHANNEL);
        sendChannelReport(4);

        expect(DeviceStateStore.getRawState().lastHardwareChannel).toBe(1);
    });

    it("survives a new view model, as the amp screen is left and reopened", async () => {
        await setChannel(2);
        await vm.requestPresetChange({ name: "Applied", fx: [] } as any);

        new DeviceViewModel();

        expect(DeviceStateStore.getRawState().lastHardwareChannel).toBe(2);
    });
});
