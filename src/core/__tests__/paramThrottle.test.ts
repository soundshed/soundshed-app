import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { DeviceViewModel } from "../deviceViewModel";
import { DeviceStateStore } from "../../stores/devicestate";
import { platformEvents } from "../platformUtils";

// Knob drags send a stream of param changes. A single shared 50 ms debounce used to
// drop every change but the last one across all knobs (moving two knobs together lost
// one of them) and sent nothing at all while a knob kept moving. A fixed 40 ms throttle
// that replaced it queued far more sends than BLE delivers (one write per 500 ms), so a
// 2 s drag left a toggle pressed afterwards waiting 25 s behind the backlog.

const twinTone = () => ({
    name: "Throttle Test",
    fx: [
        {
            type: "pg.spark40.Twin", name: "Twin", enabled: true,
            params: [
                { paramId: "0", value: 0.1 },
                { paramId: "1", value: 0.1 },
            ]
        },
        {
            type: "pg.spark40.DelayMono", name: "Digital Delay", enabled: true,
            params: [{ paramId: "0", value: 0.1 }]
        }
    ]
} as any);

function paramValue(dspId: string, index: string) {
    return DeviceStateStore.getRawState().presetTone.fx.find(f => f.type == dspId).params.find(p => p.paramId == index).value;
}

describe("fx param change coalescing", () => {
    let vm: any;
    let invoke: any;
    // perform-action calls the test has not completed yet, oldest first
    let inFlight: Array<{ args: any, resolve: (v: any) => void, reject: (e: any) => void }>;

    beforeEach(() => {
        vi.spyOn(platformEvents, "on").mockImplementation(() => platformEvents as any);
        inFlight = [];
        invoke = vi.spyOn(platformEvents, "invoke").mockImplementation((_type: any, args: any) =>
            new Promise((resolve, reject) => { inFlight.push({ args, resolve, reject }); }) as any);

        vm = new DeviceViewModel();

        DeviceStateStore.update(s => { s.presetTone = twinTone(); });
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    function sentParams() {
        return invoke.mock.calls
            .filter(c => c[0] == "perform-action" && c[1].action == "setFxParam")
            .map(c => c[1].data);
    }

    // completes the oldest outstanding call and lets its follow-up send go out
    async function settleNext(fail = false) {
        const call = inFlight.shift();
        if (fail) call.reject(new Error("write failed"));
        else call.resolve(true);
        await new Promise(r => setTimeout(r, 0));
    }

    it("sends the first change straight away", async () => {
        await vm.requestFxParamChange({ dspId: "pg.spark40.Twin", index: 0, value: 0.3 });

        expect(sentParams()).toEqual([{ dspId: "Twin", index: 0, value: 0.3 }]);
        expect(paramValue("pg.spark40.Twin", "0")).toBe(0.3);
    });

    it("holds later changes while a send is in flight and then sends only the latest", async () => {
        await vm.requestFxParamChange({ dspId: "pg.spark40.Twin", index: 0, value: 0.3 });
        await vm.requestFxParamChange({ dspId: "pg.spark40.Twin", index: 0, value: 0.4 });
        await vm.requestFxParamChange({ dspId: "pg.spark40.Twin", index: 0, value: 0.5 });

        expect(sentParams()).toHaveLength(1);

        await settleNext();

        expect(sentParams().map(p => p.value)).toEqual([0.3, 0.5]);
        expect(paramValue("pg.spark40.Twin", "0")).toBe(0.5);

        // nothing left to send once the last one settles
        await settleNext();
        expect(sentParams()).toHaveLength(2);
        expect(inFlight).toHaveLength(0);
    });

    it("still sends the latest value when the in-flight send fails", async () => {
        await vm.requestFxParamChange({ dspId: "pg.spark40.Twin", index: 0, value: 0.3 });
        await vm.requestFxParamChange({ dspId: "pg.spark40.Twin", index: 0, value: 0.8 });

        await settleNext(true);

        expect(sentParams().map(p => p.value)).toEqual([0.3, 0.8]);
    });

    it("sends right away again once the previous send has settled", async () => {
        await vm.requestFxParamChange({ dspId: "pg.spark40.Twin", index: 0, value: 0.3 });
        await settleNext();

        await vm.requestFxParamChange({ dspId: "pg.spark40.Twin", index: 0, value: 0.9 });

        expect(sentParams().map(p => p.value)).toEqual([0.3, 0.9]);
    });

    it("does not drop changes when two params of the same block move together", async () => {
        await vm.requestFxParamChange({ dspId: "pg.spark40.Twin", index: 0, value: 0.3 });
        await vm.requestFxParamChange({ dspId: "pg.spark40.Twin", index: 1, value: 0.7 });
        await vm.requestFxParamChange({ dspId: "pg.spark40.Twin", index: 0, value: 0.35 });
        await vm.requestFxParamChange({ dspId: "pg.spark40.Twin", index: 1, value: 0.75 });

        await settleNext();
        await settleNext();

        expect(sentParams()).toEqual(expect.arrayContaining([
            { dspId: "Twin", index: 0, value: 0.35 },
            { dspId: "Twin", index: 1, value: 0.75 },
        ]));
        expect(paramValue("pg.spark40.Twin", "0")).toBe(0.35);
        expect(paramValue("pg.spark40.Twin", "1")).toBe(0.75);
    });

    it("coalesces each block separately", async () => {
        await vm.requestFxParamChange({ dspId: "pg.spark40.Twin", index: 0, value: 0.3 });
        await vm.requestFxParamChange({ dspId: "pg.spark40.DelayMono", index: 0, value: 0.6 });

        expect(sentParams()).toEqual([
            { dspId: "Twin", index: 0, value: 0.3 },
            { dspId: "DelayMono", index: 0, value: 0.6 },
        ]);
    });

    it("leaves the immediate variant uncoalesced for MIDI control", async () => {
        vm.requestFxParamChangeImmediate({ dspId: "pg.spark40.Twin", index: 0, value: 0.3 });
        vm.requestFxParamChangeImmediate({ dspId: "pg.spark40.Twin", index: 0, value: 0.4 });

        expect(sentParams().map(p => p.value)).toEqual([0.3, 0.4]);
    });

    it("does not leave an unhandled rejection or a stuck entry when the block is no longer in the preset", async () => {
        await expect(vm.requestFxParamChange({ dspId: "pg.spark40.Missing", index: 0, value: 0.3 })).resolves.toBe(true);
        await new Promise(r => setTimeout(r, 0));

        expect(sentParams()).toHaveLength(0);
        expect(vm.fxParamSends.size).toBe(0);
    });
});

describe("fx param changes over a slow transport", () => {
    // Like SparkDeviceManager.sendCommand + BleProvider.write: commands run one at a
    // time and each takes 500 ms to reach the amp.
    const commandMs = 500;

    let vm: any;
    let delivered: Array<{ action: string, data: any, at: number }>;
    let outstandingParams: number;
    let maxOutstandingParams: number;

    beforeEach(() => {
        vi.useFakeTimers();
        vi.spyOn(platformEvents, "on").mockImplementation(() => platformEvents as any);

        delivered = [];
        outstandingParams = 0;
        maxOutstandingParams = 0;
        let chain: Promise<any> = Promise.resolve();

        vi.spyOn(platformEvents, "invoke").mockImplementation((_type: any, a: any) => {
            const data = { ...a.data };
            if (a.action == "setFxParam") {
                outstandingParams++;
                maxOutstandingParams = Math.max(maxOutstandingParams, outstandingParams);
            }
            const run = chain.then(() => new Promise(resolve => setTimeout(() => {
                delivered.push({ action: a.action, data, at: Date.now() });
                if (a.action == "setFxParam") outstandingParams--;
                resolve(true);
            }, commandMs)));
            chain = run;
            return run as any;
        });

        vm = new DeviceViewModel();
        DeviceStateStore.update(s => { s.presetTone = twinTone(); });
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    async function drag(seconds: number, index = 0) {
        // 60 Hz pointer moves, value ramps to 1
        const steps = seconds * 60;
        for (let i = 1; i <= steps; i++) {
            vm.requestFxParamChange({ dspId: "pg.spark40.Twin", index, value: i / steps });
            await vi.advanceTimersByTimeAsync(1000 / 60);
        }
    }

    it("keeps at most one param send queued during a long drag and delivers the final value", async () => {
        await drag(2);
        await vi.advanceTimersByTimeAsync(10000);

        const params = delivered.filter(d => d.action == "setFxParam");

        // one in flight at a time, so no more sends than the transport can deliver
        expect(maxOutstandingParams).toBeLessThanOrEqual(1);
        expect(params.length).toBeLessThanOrEqual(2000 / commandMs + 2);
        expect(params[params.length - 1].data.value).toBe(1);
        expect(paramValue("pg.spark40.Twin", "0")).toBe(1);
    });

    it("does not hold a toggle pressed after a drag behind a backlog of param sends", async () => {
        await drag(2);

        const pressedAt = Date.now();
        const toggle = vm.requestFxToggle({ dspId: "pg.spark40.Twin", value: 0, type: "toggle" });
        await vi.advanceTimersByTimeAsync(30000);
        await toggle;

        const toggleAt = delivered.find(d => d.action == "setFxToggle").at;
        // at worst behind the one param send already in flight
        expect(toggleAt - pressedAt).toBeLessThanOrEqual(2 * commandMs);

        const params = delivered.filter(d => d.action == "setFxParam");
        expect(params[params.length - 1].data.value).toBe(1);
    });
});
