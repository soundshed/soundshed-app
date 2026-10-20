import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { DeviceViewModel } from "../deviceViewModel";
import { DeviceStateStore } from "../../stores/devicestate";
import { VIRTUAL_CHANNEL } from "../sparkChannels";
import { platformEvents } from "../platformUtils";

// A tone applied from the tone chooser is uploaded to the virtual channel (0x7f).
// The UI used to wait for the amp to echo that preset back, but a Spark 2 does not
// reliably answer a query for the virtual channel, so the previously selected tone's
// name and knob positions stayed on screen.

function buildSparkPreset(name: string) {
    return {
        meta: { name, description: "", id: "test-id", version: "0.7", icon: "icon.png" },
        bpm: 120,
        type: "jamup_speaker",
        sigpath: [
            { dspId: "bias.noisegate", active: true, params: [{ index: 0, value: 0.1 }] },
            { dspId: "BlueComp", active: true, params: [{ index: 0, value: 0.5 }] },
            { dspId: "GuitarMuff", active: true, params: [{ index: 0, value: 0.3 }] },
            { dspId: "YJM100", active: true, params: [{ index: 0, value: 0.7 }] },
            { dspId: "Flanger", active: true, params: [{ index: 0, value: 0.2 }] },
            { dspId: "DelayMono", active: true, params: [{ index: 0, value: 0.4 }] },
            { dspId: "bias.reverb", active: true, params: [0, 1, 2, 3, 4, 5, 6].map(i => ({ index: i, value: 0.5 })) }
        ]
    };
}

describe("applying a tone updates the UI immediately", () => {
    let vm: DeviceViewModel;

    beforeEach(() => {
        vm = new DeviceViewModel();
        DeviceStateStore.update(s => {
            s.presetTone = { name: "Iron Hammer" } as any;
            s.selectedChannel = 5;
        });
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("shows the applied tone without waiting for the amp to echo it back", async () => {
        vi.spyOn(platformEvents, "invoke").mockResolvedValue(true as any);

        const applied = await vm.requestPresetChange(buildSparkPreset("Fluid Motion") as any);

        expect(applied).toBe(true);
        expect(DeviceStateStore.getRawState().presetTone.name).toBe("Fluid Motion");
    });

    it("moves the UI onto the virtual channel, not a hardware slot", async () => {
        vi.spyOn(platformEvents, "invoke").mockResolvedValue(true as any);

        await vm.requestPresetChange(buildSparkPreset("Fluid Motion") as any);

        expect(DeviceStateStore.getRawState().selectedChannel).toBe(VIRTUAL_CHANNEL);
    });

    it("leaves the previous tone on screen when the upload fails", async () => {
        vi.spyOn(platformEvents, "invoke").mockResolvedValue(false as any);

        const applied = await vm.requestPresetChange(buildSparkPreset("Fluid Motion") as any);

        expect(applied).toBe(false);
        expect(DeviceStateStore.getRawState().presetTone.name).toBe("Iron Hammer");
        expect(DeviceStateStore.getRawState().selectedChannel).toBe(5);
    });

    it("still reports success when the tone cannot be mapped for display", async () => {
        vi.spyOn(platformEvents, "invoke").mockResolvedValue(true as any);
        // A malformed reverb block makes the display mapping throw. The tone is
        // already on the amp, so the apply must still be reported as successful.
        const broken: any = buildSparkPreset("Fluid Motion");
        broken.sigpath[6].params = [];

        const applied = await vm.requestPresetChange(broken);

        expect(applied).toBe(true);
    });

    // Replays the full sequence observed on a Spark 2: apply a tone, then the
    // amp reports its hardware slot and answers a preset query with that slot's stored
    // preset. The UI must keep showing the tone that was applied.
    it("keeps the applied tone on screen through the amp's follow-up chatter", async () => {
        const handlers: Record<string, any> = {};
        vi.spyOn(platformEvents, "on").mockImplementation((type: string, handler: any) => {
            handlers[type] = handler;
            return platformEvents as any;
        });
        vi.spyOn(platformEvents, "invoke").mockResolvedValue(true as any);

        const liveVm = new DeviceViewModel();
        liveVm.setupEventListeners();

        await liveVm.requestPresetChange(buildSparkPreset("Fluid Motion") as any);
        expect(DeviceStateStore.getRawState().presetTone.name).toBe("Fluid Motion");

        // The amp reports the hardware slot it is really sitting on...
        handlers["device-state-changed"](null, {
            message: { type: "hardware_channel_current", presetNumber: 6 }
        });
        // ...and returns that slot's preset for the virtual channel query.
        handlers["device-state-changed"](null, {
            presetConfig: { name: "Iron Hammer", fx: [] }
        });

        expect(DeviceStateStore.getRawState().presetTone.name).toBe("Fluid Motion");
    });
});
