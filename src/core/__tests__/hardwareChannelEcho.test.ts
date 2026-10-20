import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { DeviceViewModel } from "../deviceViewModel";
import { DeviceStateStore } from "../../stores/devicestate";
import { VIRTUAL_CHANNEL } from "../sparkChannels";
import { platformEvents } from "../platformUtils";

// An applied tone lives on the virtual channel (0x7f), but the amp keeps reporting a
// real hardware slot in its hardware_channel_current messages. Acting on that echo
// switched the UI back to that slot's stored preset, overwriting the tone the user
// had just loaded.

describe("hardware channel echo after applying a tone", () => {
    let vm: any;
    let handlers: Record<string, (event: any, args: any) => void>;

    beforeEach(() => {
        handlers = {};
        vi.spyOn(platformEvents, "on").mockImplementation((type: string, handler: any) => {
            handlers[type] = handler;
            return platformEvents as any;
        });
        vi.spyOn(platformEvents, "invoke").mockResolvedValue(true as any);

        vm = new DeviceViewModel();
        vm.setupEventListeners();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    function sendChannelReport(presetNumber: number) {
        handlers["device-state-changed"]?.(null, {
            message: { type: "hardware_channel_current", presetNumber }
        });
    }

    function sendPresetConfig(name: string) {
        handlers["device-state-changed"]?.(null, {
            presetConfig: { name, fx: [] }
        });
    }

    it("ignores preset data the amp returns for the virtual channel after an apply", () => {
        DeviceStateStore.update(s => {
            s.selectedChannel = VIRTUAL_CHANNEL;
            s.presetTone = { name: "Fluid Motion" } as any;
        });
        vm.lastVirtualChannelApplyTime = Date.now();

        // The amp answers a query for channel 0x7f with its hardware slot's preset.
        sendPresetConfig("Iron Hammer");

        expect(DeviceStateStore.getRawState().presetTone.name).toBe("Fluid Motion");
    });

    it("accepts preset data from the amp once the echo window has passed", () => {
        DeviceStateStore.update(s => {
            s.selectedChannel = VIRTUAL_CHANNEL;
            s.presetTone = { name: "Fluid Motion" } as any;
        });
        vm.lastVirtualChannelApplyTime = Date.now() - 60000;

        sendPresetConfig("Iron Hammer");

        expect(DeviceStateStore.getRawState().presetTone.name).toBe("Iron Hammer");
    });

    it("accepts preset data for a normal hardware channel", () => {
        DeviceStateStore.update(s => {
            s.selectedChannel = 3;
            s.presetTone = { name: "Fluid Motion" } as any;
        });
        vm.lastVirtualChannelApplyTime = Date.now();

        sendPresetConfig("Iron Hammer");

        expect(DeviceStateStore.getRawState().presetTone.name).toBe("Iron Hammer");
    });

    it("ignores the amp's hardware slot echo right after a tone is applied", () => {
        DeviceStateStore.update(s => {
            s.selectedChannel = VIRTUAL_CHANNEL;
            s.presetTone = { name: "Fluid Motion" } as any;
        });
        vm.lastVirtualChannelApplyTime = Date.now();

        sendChannelReport(5);

        expect(DeviceStateStore.getRawState().selectedChannel).toBe(VIRTUAL_CHANNEL);
        expect(DeviceStateStore.getRawState().presetTone.name).toBe("Fluid Motion");
    });

    it("follows a channel the user selects on the amp once the echo window has passed", () => {
        DeviceStateStore.update(s => {
            s.selectedChannel = VIRTUAL_CHANNEL;
            s.presetTone = { name: "Fluid Motion" } as any;
        });
        // The apply happened long enough ago that this must be a real user action.
        vm.lastVirtualChannelApplyTime = Date.now() - 60000;

        sendChannelReport(3);

        expect(DeviceStateStore.getRawState().selectedChannel).toBe(3);
    });

    it("follows channel changes normally when no tone was applied", () => {
        DeviceStateStore.update(s => { s.selectedChannel = 1; });
        vm.lastVirtualChannelApplyTime = 0;

        sendChannelReport(4);

        expect(DeviceStateStore.getRawState().selectedChannel).toBe(4);
    });

    it("does nothing when the amp reports the channel already shown", () => {
        DeviceStateStore.update(s => { s.selectedChannel = 2; });
        vm.lastVirtualChannelApplyTime = 0;

        sendChannelReport(2);

        expect(DeviceStateStore.getRawState().selectedChannel).toBe(2);
    });
});
