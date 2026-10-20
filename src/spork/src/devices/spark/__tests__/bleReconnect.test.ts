import { describe, it, expect, vi } from "vitest";
import { BleProvider } from "../bleProvider";

// Reported from real use: after a failed or dropped connection, the app could not
// connect to the amp again until the page was reloaded.
//
// Only reloading cleared it because the stuck state lived on the BleProvider
// instance, which a reload recreates.

function makeProvider() {
    const provider: any = new BleProvider();
    const link = { connected: false };
    const gattConnect = vi.fn(async () => {
        link.connected = true;
        return provider.server;
    });

    provider.selectedDevice = {
        name: "Spark 40 BLE",
        id: "test-id",
        addEventListener: () => { },
        removeEventListener: () => { },
        gatt: {
            connect: gattConnect,
            disconnect: () => { link.connected = false; },
            get connected() { return link.connected; }
        }
    };

    provider.server = {
        get connected() { return link.connected; },
        getPrimaryService: async () => ({
            getCharacteristic: async () => ({
                writeValueWithoutResponse: async () => { },
                startNotifications: async () => { },
                stopNotifications: async () => { },
                addEventListener: () => { },
                removeEventListener: () => { }
            })
        })
    };

    return { provider, link, gattConnect };
}

const device = { name: "Spark 40 BLE", address: "test-id", port: null };

describe("reconnecting after the link is lost", () => {
    it("reconnects when the link dropped without a disconnect event", async () => {
        const { provider, link, gattConnect } = makeProvider();
        await provider.connect(device);

        // Some BLE stacks lose the link without raising gattserverdisconnected, so
        // nothing clears the provider's connected flag.
        link.connected = false;

        const connected = await provider.connect(device);

        expect(connected).toBe(true);
        expect(gattConnect).toHaveBeenCalledTimes(2);
        expect(link.connected).toBe(true);
    });

    it("does not reconnect a link that is still up", async () => {
        const { provider, gattConnect } = makeProvider();
        await provider.connect(device);

        const connected = await provider.connect(device);

        expect(connected).toBe(true);
        expect(gattConnect).toHaveBeenCalledTimes(1);
    });

    it("can connect again after a failed attempt", async () => {
        const { provider, gattConnect } = makeProvider();
        gattConnect.mockRejectedValueOnce(new Error("NetworkError: Connection attempt failed."));

        await expect(provider.connect(device)).rejects.toThrow();
        const connected = await provider.connect(device);

        expect(connected).toBe(true);
        expect(gattConnect).toHaveBeenCalledTimes(2);
    });

    it("reports failure rather than throwing when no device has been chosen", async () => {
        const provider: any = new BleProvider();

        await expect(provider.connect(device)).resolves.toBe(false);
    });
});

describe("overlapping connection attempts", () => {
    // An auto-reconnect and a user pressing Connect can run at the same time.
    it("shares one attempt instead of driving gatt.connect() twice", async () => {
        const { provider, gattConnect } = makeProvider();

        const [a, b] = await Promise.all([provider.connect(device), provider.connect(device)]);

        expect(a).toBe(true);
        expect(b).toBe(true);
        expect(gattConnect).toHaveBeenCalledTimes(1);
    });

    it("allows a fresh attempt once the shared one has finished", async () => {
        const { provider, link, gattConnect } = makeProvider();
        await Promise.all([provider.connect(device), provider.connect(device)]);

        link.connected = false;
        await provider.connect(device);

        expect(gattConnect).toHaveBeenCalledTimes(2);
    });

    it("allows a fresh attempt after the shared one failed", async () => {
        const { provider, gattConnect } = makeProvider();
        gattConnect.mockRejectedValueOnce(new Error("NetworkError"));

        await expect(provider.connect(device)).rejects.toThrow();

        await expect(provider.connect(device)).resolves.toBe(true);
    });
});
