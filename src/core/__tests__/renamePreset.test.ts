import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { DeviceViewModel } from "../deviceViewModel";
import { DeviceStateStore } from "../../stores/devicestate";
import { AppStateStore } from "../../stores/appstate";
import { VIRTUAL_CHANNEL } from "../sparkChannels";
import { platformEvents } from "../platformUtils";
import { FxCatalogProvider } from "../../spork/src/devices/spark/sparkFxCatalog";

// The Spark protocol has no rename command. Renaming a channel stores the whole current
// tone to that slot again under the new name (same UUID), then reads the slot back to
// check the name the amp reports. A local rename only changes the name on screen.

const tone = () => ({
    toneId: "pg.tc.keeper", name: "Keeper", version: "0.7",
    fx: [{ type: "pg.spark40.Twin", name: "Twin", enabled: true, params: [{ paramId: "0", value: 0.5 }] }]
}) as any;

describe("renaming a preset", () => {
    let vm: any;
    let invoke: any;
    let handlers: Record<string, (event: any, args: any) => void>;

    beforeEach(() => {
        handlers = {};
        vi.spyOn(platformEvents, "on").mockImplementation((type: string, handler: any) => {
            handlers[type] = handler;
            return platformEvents as any;
        });
        invoke = vi.spyOn(platformEvents, "invoke").mockResolvedValue(true as any);

        vm = new DeviceViewModel();
        vm.setupEventListeners();

        AppStateStore.update(s => { s.numPresetSlots = 4; });
        DeviceStateStore.update(s => {
            s.isConnected = true;
            s.selectedChannel = 1;
            s.presetTone = tone();
            // CH2's preset has loaded from the amp
            s.presetToneSlot = 1;
            s.fxCatalog = FxCatalogProvider.getFxCatalog();
            s.hasUnsavedEdits = false;
            s.slotNames = {};
            s.lastNameCheck = null;
        });
    });

    afterEach(() => {
        vi.restoreAllMocks();
        vi.useRealTimers();
    });

    const calls = (action: string) => invoke.mock.calls.filter(c => c[0] == "perform-action" && c[1].action == action);

    // The amp's reply to get_preset, as the device manager delivers it.
    function sendPresetReply(name: string) {
        handlers["device-state-changed"]?.(null, {
            presetConfig: { ...tone(), name },
            message: { type: "preset" }
        });
    }

    function sendMessage(message: any) {
        handlers["device-state-changed"]?.(null, { message });
    }

    async function waitForRead() {
        await vi.waitFor(() => expect(calls("getPreset")).toHaveLength(1));
    }

    describe("on screen only", () => {
        it("survives the next amp message, which repeats the reader's last preset", () => {
            vm.renameTone("Crunch");

            // a knob turned on the amp: the event also carries the stale preset
            handlers["device-state-changed"]?.(null, {
                presetConfig: { ...tone(), name: "Keeper" },
                message: { type: "fx_param_msg", dspId: "Twin", index: 0, value: 0.8 }
            });
            handlers["device-state-changed"]?.(null, {
                presetConfig: { ...tone(), name: "Keeper" },
                message: { type: "hardware_bpm", bpm: 100 }
            });

            const t = DeviceStateStore.getRawState().presetTone;
            expect(t.name).toBe("Crunch");
            expect(t.fx[0].params[0].value).toBe(0.8);
        });

        it("renames the tone without sending anything", () => {
            expect(vm.renameTone("  New Name ")).toBe(true);

            expect(DeviceStateStore.getRawState().presetTone.name).toBe("New Name");
            expect(DeviceStateStore.getRawState().presetTone.toneId).toBe("pg.tc.keeper");
            expect(invoke).not.toHaveBeenCalled();
        });

        it("refuses an invalid name or a missing tone", () => {
            expect(vm.renameTone("")).toBe(false);
            expect(vm.renameTone("Café")).toBe(false);
            DeviceStateStore.update(s => { s.presetTone = null; });
            expect(vm.renameTone("Fine")).toBe(false);
            expect(invoke).not.toHaveBeenCalled();
        });

        it("leaves the unsaved-edits flag as it is", () => {
            DeviceStateStore.update(s => { s.hasUnsavedEdits = true; });
            vm.renameTone("New Name");
            expect(DeviceStateStore.getRawState().hasUnsavedEdits).toBe(true);
        });
    });

    describe("on a hardware channel", () => {
        it("refuses an invalid name", async () => {
            await expect(vm.renameChannelPreset(1, "x".repeat(41))).resolves.toEqual({ ok: false, reason: "invalid" });
            expect(invoke).not.toHaveBeenCalled();
        });

        it("refuses with no amp connected", async () => {
            DeviceStateStore.update(s => { s.isConnected = false; });
            await expect(vm.renameChannelPreset(1, "New Name")).resolves.toEqual({ ok: false, reason: "not-connected" });
            expect(invoke).not.toHaveBeenCalled();
        });

        it.each([
            ["the virtual channel", VIRTUAL_CHANNEL, 4],
            ["slot 8 on a 4-slot amp", 8, 4],
        ])("refuses %s", async (_label, slot, slots) => {
            AppStateStore.update(s => { s.numPresetSlots = slots; });
            DeviceStateStore.update(s => { s.selectedChannel = slot; });

            await expect(vm.renameChannelPreset(slot, "New Name")).resolves.toEqual({ ok: false, reason: "not-hardware" });
            expect(invoke).not.toHaveBeenCalled();
        });

        it("sends nothing when the selected channel changed since the dialog opened", async () => {
            DeviceStateStore.update(s => { s.selectedChannel = 2; });

            await expect(vm.renameChannelPreset(1, "New Name")).resolves.toEqual({ ok: false, reason: "channel-changed" });
            expect(invoke).not.toHaveBeenCalled();
        });

        it("uploads the tone to the selected channel under the new name, then reads it back", async () => {
            const result = vm.renameChannelPreset(1, "New Name");
            await waitForRead();

            const store = calls("storePreset");
            expect(store).toHaveLength(1);
            const [p, slot] = store[0][1].data;
            expect(slot).toBe(1);
            expect(p.meta.name).toBe("New Name");
            expect(p.meta.id).toBe("keeper");
            expect(calls("getPreset")[0][1].data).toBe(1);
            // a rename is an upload only: no store command, no channel change
            expect(calls("setChannel")).toHaveLength(0);
            expect(invoke.mock.calls.findIndex(c => c[1].action == "storePreset"))
                .toBeLessThan(invoke.mock.calls.findIndex(c => c[1].action == "getPreset"));

            sendPresetReply("New Name");

            await expect(result).resolves.toEqual({ ok: true, check: "confirmed", reportedName: "New Name" });
            expect(DeviceStateStore.getRawState().presetTone.name).toBe("New Name");
            expect(DeviceStateStore.getRawState().slotNames[1]).toBe("New Name");
        });

        it("reports a different name from the amp and shows the amp's version", async () => {
            const result = vm.renameChannelPreset(1, "New Name");
            await waitForRead();

            sendPresetReply("Keeper");

            await expect(result).resolves.toEqual({ ok: true, check: "mismatch", reportedName: "Keeper" });
            expect(DeviceStateStore.getRawState().presetTone.name).toBe("Keeper");
            expect(DeviceStateStore.getRawState().slotNames[1]).toBe("Keeper");
        });

        it("ignores the last preset the reader repeats along with other messages", async () => {
            const result = vm.renameChannelPreset(1, "New Name");
            await waitForRead();

            // e.g. a Spark 2 post-upload ack, carrying the reader's previous preset
            handlers["device-state-changed"]?.(null, {
                presetConfig: { ...tone(), name: "Keeper" },
                message: { type: "spark2_post_upload_ack" }
            });
            sendPresetReply("New Name");

            await expect(result).resolves.toMatchObject({ ok: true, check: "confirmed" });
        });

        it("reports the name as unconfirmed when the amp doesn't reply", async () => {
            vi.useFakeTimers();
            const result = vm.renameChannelPreset(1, "New Name");
            await vi.advanceTimersByTimeAsync(DeviceViewModel.nameCheckTimeoutMs + 10);

            await expect(result).resolves.toEqual({ ok: true, check: "unconfirmed" });
            expect(calls("getPreset")).toHaveLength(1);
            expect(DeviceStateStore.getRawState().presetTone.name).toBe("New Name");
        });

        it("sends nothing while the selected channel's preset hasn't loaded yet", async () => {
            // the amp switched to CH3; its preset reply hasn't arrived (or was dropped
            // because a knob moved meanwhile), so the tone on screen is still CH2's
            sendMessage({ type: "hardware_channel_current", presetNumber: 2 });
            expect(DeviceStateStore.getRawState().presetToneSlot).toBeNull();
            invoke.mockClear();

            await expect(vm.renameChannelPreset(2, "New Name")).resolves.toEqual({ ok: false, reason: "not-loaded" });
            expect(calls("storePreset")).toHaveLength(0);
        });

        it("doesn't take a repeated preset for the new channel's", async () => {
            sendMessage({ type: "hardware_channel_current", presetNumber: 2 });
            // the reader repeats CH2's preset with the next message from the amp
            handlers["device-state-changed"]?.(null, {
                presetConfig: { ...tone(), name: "Keeper" },
                message: { type: "hardware_bpm", bpm: 100 }
            });
            invoke.mockClear();

            await expect(vm.renameChannelPreset(2, "New Name")).resolves.toEqual({ ok: false, reason: "not-loaded" });
            expect(calls("storePreset")).toHaveLength(0);
        });

        it("renames once the new channel's preset has arrived", async () => {
            sendMessage({ type: "hardware_channel_current", presetNumber: 2 });
            sendPresetReply("Lead");
            expect(DeviceStateStore.getRawState().presetToneSlot).toBe(2);
            invoke.mockClear();

            const result = vm.renameChannelPreset(2, "Lead 2");
            await waitForRead();
            expect(calls("storePreset")[0][1].data[1]).toBe(2);
            sendPresetReply("Lead 2");
            await expect(result).resolves.toMatchObject({ ok: true, check: "confirmed" });
        });

        it("keeps the UUID the amp reported for the slot", async () => {
            const ampId = "1E6E4B3A-6D4B-4C4A-9C42-2E1A2B3C4D5E";
            const sparkPreset = (name: string) => ({
                meta: { id: ampId, name, version: "0.7", description: "", icon: "icon.png" },
                sigpath: [{ dspId: "Twin", active: true, params: [{ index: 0, value: 0.5 }] }],
                bpm: 120
            });
            handlers["device-state-changed"]?.(null, { presetConfig: sparkPreset("Clean"), message: { type: "preset" } });
            expect(DeviceStateStore.getRawState().presetTone.toneId).toBe(ampId);

            const result = vm.renameChannelPreset(1, "Lead");
            await waitForRead();
            expect(calls("storePreset")[0][1].data[0].meta.id).toBe(ampId);

            // and again after the read-back
            handlers["device-state-changed"]?.(null, { presetConfig: sparkPreset("Lead"), message: { type: "preset" } });
            await expect(result).resolves.toMatchObject({ ok: true, check: "confirmed" });
            expect(DeviceStateStore.getRawState().presetTone.toneId).toBe(ampId);
            invoke.mockClear();

            const second = vm.renameChannelPreset(1, "Lead 2");
            await waitForRead();
            expect(calls("storePreset")[0][1].data[0].meta.id).toBe(ampId);
            handlers["device-state-changed"]?.(null, { presetConfig: sparkPreset("Lead 2"), message: { type: "preset" } });
            await second;
        });

        it("reports a failed store and leaves the name alone", async () => {
            invoke.mockResolvedValue(false as any);

            await expect(vm.renameChannelPreset(1, "New Name")).resolves.toEqual({ ok: false, reason: "store-failed" });
            expect(calls("getPreset")).toHaveLength(0);
            expect(DeviceStateStore.getRawState().presetTone.name).toBe("Keeper");
        });
    });

    describe("unsaved edits", () => {
        const edited = () => DeviceStateStore.getRawState().hasUnsavedEdits;
        const markEdited = () => DeviceStateStore.update(s => { s.hasUnsavedEdits = true; });

        it("are flagged by a knob change", async () => {
            await vm.requestFxParamChange({ dspId: "pg.spark40.Twin", index: 0, value: 0.6 });
            expect(edited()).toBe(true);
        });

        it("are flagged by switching a block on or off", async () => {
            await vm.requestFxToggle({ dspId: "pg.spark40.Twin", value: "0" });
            expect(edited()).toBe(true);
        });

        it("are flagged by a model change", async () => {
            const target = FxCatalogProvider.getFxCatalog().catalog.find(c => c.type == "amp" && !c.isRemoved && c.dspId != "pg.spark40.Twin");
            await expect(vm.requestFxChange({ dspIdOld: "pg.spark40.Twin", dspIdNew: target.dspId })).resolves.toBe(true);
            expect(edited()).toBe(true);
        });

        it("are flagged by a knob turned on the amp", () => {
            sendMessage({ type: "fx_param_msg", dspId: "Twin", index: 0, value: 0.3 });
            expect(edited()).toBe(true);
        });

        it("are flagged and applied when a block is switched on the amp", () => {
            sendMessage({ type: "fx_toggled", dspId: "Twin", active: false });
            expect(edited()).toBe(true);
            expect(DeviceStateStore.getRawState().presetTone.fx[0].enabled).toBe(false);
        });

        it("reach the upload when a block was switched on the amp before a channel rename", async () => {
            sendMessage({ type: "fx_toggled", dspId: "Twin", active: false });

            const result = vm.renameChannelPreset(1, "New Name");
            await waitForRead();
            expect(calls("storePreset")[0][1].data[0].sigpath[0].active).toBe(false);
            sendPresetReply("New Name");
            await result;
        });

        it("are flagged by a model changed on the amp", () => {
            sendMessage({ type: "fx_change_msg", dspIdOld: "Twin", dspIdNew: "Bassman" });
            expect(edited()).toBe(true);
        });

        it("are cleared by switching channel", () => {
            markEdited();
            sendMessage({ type: "hardware_channel_current", presetNumber: 3 });
            expect(edited()).toBe(false);
        });

        it("are not cleared when the amp reports the channel already shown", () => {
            markEdited();
            sendMessage({ type: "hardware_channel_current", presetNumber: 1 });
            expect(edited()).toBe(true);
        });

        it("are cleared by a store to the selected slot", async () => {
            markEdited();
            await vm.storeCurrentPreset(1);
            expect(edited()).toBe(false);
        });

        it("a store to the selected slot also marks the tone as that slot's", async () => {
            DeviceStateStore.update(s => { s.presetToneSlot = null; });
            await vm.storeCurrentPreset(2);
            expect(DeviceStateStore.getRawState().presetToneSlot).toBeNull();
            await vm.storeCurrentPreset(1);
            expect(DeviceStateStore.getRawState().presetToneSlot).toBe(1);
        });

        it("are not cleared by a store to another slot", async () => {
            markEdited();
            await vm.storeCurrentPreset(2);
            expect(edited()).toBe(true);
        });

        it("are cleared when the amp stores the selected slot itself", () => {
            markEdited();
            sendMessage({ type: "hardware_preset_stored", presetNumber: 2 });
            expect(edited()).toBe(true);

            sendMessage({ type: "hardware_preset_stored", presetNumber: 1 });
            expect(edited()).toBe(false);
        });

        it("are not cleared by Refresh", async () => {
            markEdited();
            await vm.requestPresetConfig();
            sendPresetReply("Keeper");
            expect(edited()).toBe(true);
        });

        it("are cleared by applying a tone (it becomes Live)", async () => {
            markEdited();
            await vm.requestPresetChange({
                meta: { id: "abc", name: "Applied", version: "0.7", description: "", icon: "icon.png" },
                sigpath: [{ dspId: "Twin", active: true, params: [{ index: 0, value: 0.5 }] }]
            });
            expect(DeviceStateStore.getRawState().selectedChannel).toBe(VIRTUAL_CHANNEL);
            expect(edited()).toBe(false);
        });
    });
});
