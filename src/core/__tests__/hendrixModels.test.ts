import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { DeviceViewModel } from "../deviceViewModel";
import { DeviceStateStore } from "../../stores/devicestate";
import { platformEvents } from "../platformUtils";
import { FxCatalogProvider } from "../../spork/src/devices/spark/sparkFxCatalog";
import { FxMappingSparkToTone } from "../fxMapping";

// The Jimi Hendrix expansion adds 6 amps and 6 effects. Only 4 of the 12 were in the
// fx catalog, so a preset using any of the others left that block's model list empty
// and the amp could not be changed from Soundshed.

const HENDRIX_MODELS: Array<[string, string, number]> = [
    ["JH.JTM45", "amp", 5],
    ["JH.SuperLead100", "amp", 5],
    ["JH.DualShowman", "amp", 5],
    ["JH.Sunn100", "amp", 5],
    ["JH.Bassman50Silver", "amp", 5],
    ["JH.SoundCity100", "amp", 5],
    ["JH.Vox846", "comp", 5],
    ["JH.AxisFuzz", "drive", 2],
    ["JH.SupaFuzz", "drive", 2],
    ["JH.Octavia", "drive", 2],
    ["JH.FuzzTone", "drive", 2],
    ["JH.VoodooVibeJr", "modulation", 4],
];

describe("fx catalog: Jimi Hendrix expansion", () => {
    const catalog = FxCatalogProvider.getFxCatalog().catalog;

    it.each(HENDRIX_MODELS)("knows %s as a %s with %i params", (dspId, type, paramCount) => {
        const item = catalog.find(c => c.dspId == FxMappingSparkToTone.mapFxId(dspId));

        expect(item).toBeDefined();
        expect(item.type).toBe(type);
        expect(item.isRemoved).not.toBe(true);
        expect(item.params.map(p => p.index).sort()).toEqual([...Array(paramCount).keys()]);
    });

    it("has no duplicate dsp ids", () => {
        const ids = catalog.map(c => c.dspId);
        expect(new Set(ids).size).toBe(ids.length);
    });
});

describe("fx changes involving models missing from the catalog", () => {
    let vm: any;
    let handlers: Record<string, (event: any, args: any) => void>;
    let invoke: any;

    beforeEach(() => {
        handlers = {};
        vi.spyOn(platformEvents, "on").mockImplementation((type: string, handler: any) => {
            handlers[type] = handler;
            return platformEvents as any;
        });
        invoke = vi.spyOn(platformEvents, "invoke").mockResolvedValue(true as any);

        vm = new DeviceViewModel();
        vm.setupEventListeners();

        DeviceStateStore.update(s => {
            s.fxCatalog = FxCatalogProvider.getFxCatalog();
            s.presetTone = {
                name: "Hey Jimi",
                fx: [{ type: "pg.spark40.Twin", name: "Blackface Duo", enabled: true, params: [] }]
            } as any;
        });
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("follows an amp-side switch to a model the catalog does not know", () => {
        const stateChanged = vi.fn();
        vm.addStateChangeListener(stateChanged);

        // used to throw a TypeError reading .name of undefined, so the UI never updated
        expect(() => handlers["device-state-changed"](null, {
            message: { type: "fx_change_msg", dspIdOld: "Twin", dspIdNew: "JH.SomeFutureAmp" }
        })).not.toThrow();

        const fx = DeviceStateStore.getRawState().presetTone.fx[0];
        expect(fx.type).toBe("pg.spark40.JH.SomeFutureAmp");
        expect(fx.name).toBe("JH.SomeFutureAmp");
        expect(stateChanged).toHaveBeenCalled();
    });

    it("sends a change to one of the added Hendrix amps without the soundshed prefix", async () => {
        const changed = await vm.requestFxChange({ dspIdOld: "pg.spark40.Twin", dspIdNew: "pg.spark40.JH.Sunn100" });

        expect(changed).toBe(true);
        expect(invoke).toHaveBeenCalledWith("perform-action", {
            action: "changeFx",
            data: { dspIdOld: "Twin", dspIdNew: "JH.Sunn100" }
        });
        expect(DeviceStateStore.getRawState().presetTone.fx[0].name).toBe("Sunn 100S");
    });

    it("refuses a change to an id the catalog does not know instead of throwing", async () => {
        const changed = await vm.requestFxChange({ dspIdOld: "pg.spark40.Twin", dspIdNew: "pg.spark40.JH.SomeFutureAmp" });

        expect(changed).toBe(false);
        expect(invoke).not.toHaveBeenCalledWith("perform-action", expect.objectContaining({ action: "changeFx" }));
    });
});
