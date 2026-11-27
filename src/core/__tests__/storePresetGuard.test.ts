import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { DeviceViewModel } from "../deviceViewModel";
import { DeviceStateStore } from "../../stores/devicestate";
import { AppStateStore } from "../../stores/appstate";
import { VIRTUAL_CHANNEL } from "../sparkChannels";
import { platformEvents } from "../platformUtils";
import { FxCatalogProvider } from "../../spork/src/devices/spark/sparkFxCatalog";

// Saving while an applied tone is live used to pass the virtual channel (0x7f) straight
// through as the slot to store to, and the result was always reported as success, even
// with no amp connected (the failed write is swallowed further down).

describe("storing the current preset", () => {
    let vm: any;
    let invoke: any;

    beforeEach(() => {
        vi.spyOn(platformEvents, "on").mockImplementation(() => platformEvents as any);
        invoke = vi.spyOn(platformEvents, "invoke").mockResolvedValue(true as any);

        vm = new DeviceViewModel();

        AppStateStore.update(s => { s.numPresetSlots = 4; });
        DeviceStateStore.update(s => {
            s.isConnected = true;
            s.presetTone = {
                toneId: "pg.tc.keeper", name: "Keeper", version: "0.7",
                fx: [{ type: "pg.spark40.Twin", name: "Twin", enabled: true, params: [{ paramId: "0", value: 0.5 }] }]
            } as any;
        });
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    function storeCalls() {
        return invoke.mock.calls.filter(c => c[0] == "perform-action" && c[1].action == "storePreset");
    }

    it.each([
        ["the virtual channel", VIRTUAL_CHANNEL],
        ["a negative slot", -1],
        ["a slot past the device's last one", 4],
        ["a fractional slot", 1.5],
        ["NaN", NaN],
    ])("refuses %s without sending anything", async (_label, slot) => {
        await expect(vm.storeCurrentPreset(slot)).resolves.toBe(false);
        expect(storeCalls()).toHaveLength(0);
    });

    it("refuses to store with no amp connected", async () => {
        DeviceStateStore.update(s => { s.isConnected = false; });

        await expect(vm.storeCurrentPreset(1)).resolves.toBe(false);
        expect(storeCalls()).toHaveLength(0);
    });

    it("stores to a hardware slot", async () => {
        await expect(vm.storeCurrentPreset(3)).resolves.toBe(true);

        expect(storeCalls()).toHaveLength(1);
        expect(storeCalls()[0][1].data[1]).toBe(3);
    });

    it("follows the connected device's slot count", async () => {
        AppStateStore.update(s => { s.numPresetSlots = 8; });

        await expect(vm.storeCurrentPreset(7)).resolves.toBe(true);
        expect(storeCalls()).toHaveLength(1);
    });

    it("reports failure when the platform call reports failure", async () => {
        invoke.mockResolvedValue(false as any);

        await expect(vm.storeCurrentPreset(0)).resolves.toBe(false);
    });

    it("reports failure when the platform call throws", async () => {
        invoke.mockRejectedValue(new Error("link lost"));

        await expect(vm.storeCurrentPreset(0)).resolves.toBe(false);
    });

    describe("with a new name", () => {
        beforeEach(() => {
            DeviceStateStore.update(s => { s.selectedChannel = 1; s.slotNames = {}; s.hasUnsavedEdits = false; });
        });

        it.each([
            ["the virtual channel", VIRTUAL_CHANNEL],
            ["a negative slot", -1],
            ["a slot past the device's last one", 4],
            ["a fractional slot", 1.5],
            ["NaN", NaN],
        ])("still refuses %s without sending anything", async (_label, slot) => {
            await expect(vm.storeCurrentPreset(slot, "Renamed")).resolves.toBe(false);
            expect(storeCalls()).toHaveLength(0);
        });

        it("still refuses with no amp connected", async () => {
            DeviceStateStore.update(s => { s.isConnected = false; });

            await expect(vm.storeCurrentPreset(1, "Renamed")).resolves.toBe(false);
            expect(storeCalls()).toHaveLength(0);
        });

        it.each([[""], ["   "], ["x".repeat(41)], ["クリーン"]])("sends nothing for the invalid name %j", async (name) => {
            await expect(vm.storeCurrentPreset(2, name)).resolves.toBe(false);
            expect(storeCalls()).toHaveLength(0);
            expect(DeviceStateStore.getRawState().presetTone.name).toBe("Keeper");
        });

        it("stores the tone under the trimmed name and keeps its id", async () => {
            await expect(vm.storeCurrentPreset(2, "  Keeper Lead  ")).resolves.toBe(true);

            const [p, slot] = storeCalls()[0][1].data;
            expect(slot).toBe(2);
            expect(p.meta.name).toBe("Keeper Lead");
            expect(p.meta.id).toBe("keeper");
            expect(DeviceStateStore.getRawState().presetTone.toneId).toBe("pg.tc.keeper");
        });

        it("updates the tone name and the slot's known name once stored", async () => {
            await vm.storeCurrentPreset(2, "Keeper Lead");

            expect(DeviceStateStore.getRawState().presetTone.name).toBe("Keeper Lead");
            expect(DeviceStateStore.getRawState().slotNames[2]).toBe("Keeper Lead");
        });

        it.each([
            ["reports failure", () => invoke.mockResolvedValue(false as any)],
            ["throws", () => invoke.mockRejectedValue(new Error("link lost"))],
        ])("leaves the name alone when the platform call %s", async (_label, arrange) => {
            arrange();

            await expect(vm.storeCurrentPreset(2, "Keeper Lead")).resolves.toBe(false);

            expect(DeviceStateStore.getRawState().presetTone.name).toBe("Keeper");
            expect(DeviceStateStore.getRawState().slotNames[2]).toBeUndefined();
        });

        it("doesn't rename a different tone that loaded while the save was running", async () => {
            invoke.mockImplementation(async () => {
                DeviceStateStore.update(s => { s.presetTone = { ...s.presetTone, toneId: "pg.tc.other", name: "Other" }; });
                return true;
            });

            await vm.storeCurrentPreset(2, "Keeper Lead");

            expect(DeviceStateStore.getRawState().presetTone.name).toBe("Other");
            expect(DeviceStateStore.getRawState().slotNames[2]).toBe("Keeper Lead");
        });

        it("reads the selected slot back when its name changed, and reports a different name", async () => {
            vi.useFakeTimers();
            try {
                await expect(vm.storeCurrentPreset(1, "Keeper Lead")).resolves.toBe(true);

                const reads = invoke.mock.calls.filter(c => c[1]?.action == "getPreset");
                expect(reads).toHaveLength(1);
                expect(reads[0][1].data).toBe(1);

                vm.pendingNameCheck.resolve({ check: "mismatch", reportedName: "Keeper" });
                await vi.runAllTimersAsync();

                expect(DeviceStateStore.getRawState().lastNameCheck).toEqual({ slot: 1, expected: "Keeper Lead", reported: "Keeper" });
            } finally {
                DeviceStateStore.update(s => { s.lastNameCheck = null; });
                vi.useRealTimers();
            }
        });

        it("doesn't read back a save to another slot or one that kept the name", async () => {
            await vm.storeCurrentPreset(2, "Keeper Lead");
            await vm.storeCurrentPreset(1, "Keeper Lead");
            await vm.storeCurrentPreset(1);

            expect(invoke.mock.calls.filter(c => c[1]?.action == "getPreset")).toHaveLength(0);
        });
    });
});

describe("changing a block's model", () => {
    let vm: any;
    let invoke: any;

    beforeEach(() => {
        vi.spyOn(platformEvents, "on").mockImplementation(() => platformEvents as any);
        invoke = vi.spyOn(platformEvents, "invoke").mockResolvedValue(true as any);

        vm = new DeviceViewModel();
        DeviceStateStore.update(s => { s.fxCatalog = FxCatalogProvider.getFxCatalog(); s.isConnected = true; });
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    function setCurrentAmp(params: Array<{ paramId: string, value: number }>) {
        DeviceStateStore.update(s => {
            s.presetTone = {
                name: "Model Swap",
                fx: [{ type: "pg.spark40.Twin", name: "Twin", enabled: true, params }]
            } as any;
        });
    }

    // "AC Boost" has no known default values in the catalog (all null)
    const nullDefaultsAmp = () => FxCatalogProvider.getFxCatalog().catalog.find(c => c.params.length > 0 && c.params.every(p => p.value == null) && !c.isRemoved);

    it("keeps the current value for params whose catalog default is unknown", async () => {
        const target = nullDefaultsAmp();
        expect(target).toBeDefined();

        setCurrentAmp([0, 1, 2, 3, 4].map(i => ({ paramId: i.toString(), value: 0.1 * (i + 1) })));

        expect(await vm.requestFxChange({ dspIdOld: "pg.spark40.Twin", dspIdNew: target.dspId })).toBe(true);

        const params = DeviceStateStore.getRawState().presetTone.fx[0].params;
        for (const p of params) {
            expect(p.value).toBeCloseTo(0.1 * (parseInt(p.paramId) + 1));
        }
    });

    it("falls back to the middle of the range when there is no current value", async () => {
        const target = nullDefaultsAmp();
        setCurrentAmp([{ paramId: "0", value: 0.9 }]);

        await vm.requestFxChange({ dspIdOld: "pg.spark40.Twin", dspIdNew: target.dspId });

        const params = DeviceStateStore.getRawState().presetTone.fx[0].params;
        expect(params.find(p => p.paramId == "0").value).toBe(0.9);
        for (const p of params.filter(p => p.paramId != "0")) {
            expect(p.value).toBe(0.5);
        }
        expect(params.every(p => p.value != null)).toBe(true);
    });

    it("refuses the change with no amp connected and leaves the block as it was", async () => {
        const target = nullDefaultsAmp();
        setCurrentAmp([{ paramId: "0", value: 0.9 }]);
        DeviceStateStore.update(s => { s.isConnected = false; });

        await expect(vm.requestFxChange({ dspIdOld: "pg.spark40.Twin", dspIdNew: target.dspId })).resolves.toBe(false);

        expect(DeviceStateStore.getRawState().presetTone.fx[0].type).toBe("pg.spark40.Twin");
        expect(invoke).not.toHaveBeenCalledWith("perform-action", expect.objectContaining({ action: "changeFx" }));
    });

    it("still uses catalog defaults when they are known", async () => {
        const catalog = FxCatalogProvider.getFxCatalog().catalog;
        const target = catalog.find(c => c.type == "amp" && !c.isRemoved && c.params.length > 0 && c.params.every(p => p.value != null) && c.dspId != "pg.spark40.Twin");
        setCurrentAmp([{ paramId: "0", value: 0.01 }]);

        await vm.requestFxChange({ dspIdOld: "pg.spark40.Twin", dspIdNew: target.dspId });

        const params = DeviceStateStore.getRawState().presetTone.fx[0].params;
        for (const p of target.params) {
            expect(params.find(x => x.paramId == p.index.toString()).value).toBe(p.value);
        }
    });
});
