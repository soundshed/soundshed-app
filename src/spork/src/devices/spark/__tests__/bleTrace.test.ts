import { describe, it, expect, beforeEach, vi } from "vitest";
import { BleTrace } from "../bleTrace";

function withLocalStorage(value: string | null) {
    (globalThis as any).localStorage = {
        getItem: (key: string) => (key === "_bleTrace" ? value : null)
    };
}

describe("BleTrace", () => {
    beforeEach(() => {
        withLocalStorage("1");
    });

    it("is disabled unless the localStorage flag is set", () => {
        withLocalStorage(null);
        const trace = new BleTrace();
        trace.record("write", "should be dropped");
        expect(trace.getEntries()).toHaveLength(0);
    });

    it("is disabled when localStorage is unavailable", () => {
        delete (globalThis as any).localStorage;
        const trace = new BleTrace();
        expect(trace.isEnabled()).toBe(false);
        trace.record("write", "should be dropped");
        expect(trace.getEntries()).toHaveLength(0);
    });

    it("records entries when enabled", () => {
        const trace = new BleTrace();
        trace.record("write", "100b");
        trace.record("recv", "24b");

        const entries = trace.getEntries();
        expect(entries).toHaveLength(2);
        expect(entries[0].kind).toBe("write");
        expect(entries[1].detail).toBe("24b");
    });

    it("bounds the buffer so a long session cannot exhaust memory", () => {
        const trace = new BleTrace();
        for (let i = 0; i < 500; i++) {
            trace.record("write", `entry-${i}`);
        }

        const entries = trace.getEntries();
        expect(entries).toHaveLength(400);
        // Oldest entries are evicted, newest retained.
        expect(entries[entries.length - 1].detail).toBe("entry-499");
        expect(entries[0].detail).toBe("entry-100");
    });

    it("returns a copy so callers cannot mutate the buffer", () => {
        const trace = new BleTrace();
        trace.record("write", "a");
        trace.getEntries().push({ at: 0, kind: "write", detail: "injected" });
        expect(trace.getEntries()).toHaveLength(1);
    });

    it("formats each entry with an absolute time and an inter-event gap", () => {
        const trace = new BleTrace();
        trace.record("event", "send block");
        trace.record("error", "write failed");

        const lines = trace.format().split("\n");
        expect(lines).toHaveLength(2);
        expect(lines[0]).toContain("event");
        expect(lines[0]).toContain("send block");
        expect(lines[1]).toContain("error");
        expect(lines[1]).toContain("write failed");
        expect(lines[0]).toMatch(/^\+\s*\d+ms \(\s*\d+ms\)/);
    });

    it("dumps the trace on disconnect when enabled", () => {
        const spy = vi.spyOn(console, "error").mockImplementation(() => { });
        const trace = new BleTrace();
        trace.record("write", "173b");
        trace.dump("device disconnected unexpectedly");

        expect(spy).toHaveBeenCalledTimes(1);
        expect(spy.mock.calls[0][0]).toContain("device disconnected unexpectedly");
        expect(spy.mock.calls[0][0]).toContain("173b");
        spy.mockRestore();
    });

    it("stays silent on disconnect when disabled", () => {
        withLocalStorage(null);
        const spy = vi.spyOn(console, "error").mockImplementation(() => { });
        new BleTrace().dump("device disconnected unexpectedly");
        expect(spy).not.toHaveBeenCalled();
        spy.mockRestore();
    });
});
