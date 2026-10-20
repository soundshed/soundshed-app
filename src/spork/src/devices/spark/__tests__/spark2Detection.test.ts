import { describe, it, expect, beforeEach, vi } from "vitest";
import { BleProvider } from "../bleProvider";
import { SparkDeviceManager } from "../sparkDeviceManager";

// Some Spark 2 units advertise as "Spark 2 BLE" but do not expose the Spark 2 FFC8
// service, so service discovery falls back to the legacy FFC0 profile. Before this
// fix that fallback also downgraded the *protocol dialect*, so the app sent the amp
// unchunked, unacked 173-byte preset blocks and the amp dropped the BLE link.

function makeProvider(deviceName: string, spark2ServiceAvailable: boolean) {
    const provider: any = new BleProvider();
    const writes: Uint8Array[] = [];

    provider.selectedDevice = {
        name: deviceName,
        id: "test-id",
        addEventListener: () => { },
        removeEventListener: () => { },
        gatt: { connect: async () => provider.server }
    };

    provider.server = {
        connected: true,
        getPrimaryService: async (uuid: string) => {
            const isSpark2Service = uuid.startsWith("0000ffc8");
            // An amp offers exactly one of the two profiles.
            if (isSpark2Service !== spark2ServiceAvailable) {
                throw new Error("service not found");
            }
            return {
                getCharacteristic: async () => ({
                    writeValueWithoutResponse: async (v: Uint8Array) => { writes.push(v); },
                    startNotifications: async () => { },
                    stopNotifications: async () => { },
                    addEventListener: () => { },
                    removeEventListener: () => { }
                })
            };
        }
    };

    return { provider, writes };
}

describe("Spark 2 detection when the FFC8 service is unavailable", () => {
    it("still reports a Spark 2 connection after falling back to the FFC0 service", async () => {
        const { provider } = makeProvider("Spark 2 BLE", false);

        const connected = await provider.connect({ name: "Spark 2 BLE", address: "test-id", port: null });

        expect(connected).toBe(true);
        // Bound to the legacy service...
        expect(provider.isSpark2ServiceActive).toBe(false);
        // ...but still treated as Spark 2 hardware.
        expect(provider.isSpark2Connection()).toBe(true);
    });

    it("splits preset blocks into MTU-safe ATT writes on the FFC0 fallback", async () => {
        const { provider, writes } = makeProvider("Spark 2 BLE", false);
        await provider.connect({ name: "Spark 2 BLE", address: "test-id", port: null });

        // A 173-byte protocol block, the size that killed the link on real hardware.
        await provider.write(new Uint8Array(173));

        expect(writes.length).toBeGreaterThan(1);
        for (const w of writes) {
            expect(w.length).toBeLessThanOrEqual(100);
        }
        expect(writes.reduce((total, w) => total + w.length, 0)).toBe(173);
    });

    it("leaves a genuine Spark 40 on the single-write path", async () => {
        const { provider, writes } = makeProvider("Spark 40 BLE", false);
        await provider.connect({ name: "Spark 40 BLE", address: "test-id", port: null });

        expect(provider.isSpark2Connection()).toBe(false);

        await provider.write(new Uint8Array(173));

        expect(writes).toHaveLength(1);
        expect(writes[0].length).toBe(173);
    });

    it("detects a Spark 2 by service even when the name is unrecognised", async () => {
        const { provider } = makeProvider("Unnamed Amp", true);
        await provider.connect({ name: "Unnamed Amp", address: "test-id", port: null });

        expect(provider.isSpark2Connection()).toBe(true);
    });

    // Every other amp in the family speaks the original dialect and exposes FFC0, so
    // none of them may be pulled onto the Spark 2 chunked-upload path.
    it.each(["Spark 40 BLE", "Spark MINI BLE", "Spark GO BLE", "Spark NEO BLE"])(
        "keeps %s on the Spark 40 single-write path",
        async (name) => {
            const { provider, writes } = makeProvider(name, false);
            await provider.connect({ name, address: "test-id", port: null });

            expect(provider.isSpark2Connection()).toBe(false);

            await provider.write(new Uint8Array(173));

            expect(writes).toHaveLength(1);
            expect(writes[0].length).toBe(173);
        }
    );
});

describe("SparkDeviceManager Spark 2 dialect selection", () => {
    let manager: any;

    beforeEach(() => {
        manager = new SparkDeviceManager({} as any);
        manager.startReceiver = vi.fn();
    });

    it("keeps the Spark 2 dialect when the transport reports a legacy connection", async () => {
        manager.connection = {
            connect: async () => true,
            isSpark2Connection: () => false,
            onDisconnected: null
        };

        await manager.connect({ name: "Spark 2 BLE", address: "id", port: null });

        expect(manager.isSpark2Device()).toBe(true);
    });

    it("upgrades to the Spark 2 dialect when only the transport recognises it", async () => {
        manager.connection = {
            connect: async () => true,
            isSpark2Connection: () => true,
            onDisconnected: null
        };

        await manager.connect({ name: "Unnamed Amp", address: "id", port: null });

        expect(manager.isSpark2Device()).toBe(true);
    });

    it("stays on the Spark 40 dialect when neither signal indicates a Spark 2", async () => {
        manager.connection = {
            connect: async () => true,
            isSpark2Connection: () => false,
            onDisconnected: null
        };

        await manager.connect({ name: "Spark 40 BLE", address: "id", port: null });

        expect(manager.isSpark2Device()).toBe(false);
    });

    it.each(["Spark MINI BLE", "Spark GO BLE", "Spark NEO BLE"])(
        "keeps %s on the Spark 40 dialect",
        async (name) => {
            manager.connection = {
                connect: async () => true,
                isSpark2Connection: () => false,
                onDisconnected: null
            };

            await manager.connect({ name, address: "id", port: null });

            expect(manager.isSpark2Device()).toBe(false);
        }
    );
});
