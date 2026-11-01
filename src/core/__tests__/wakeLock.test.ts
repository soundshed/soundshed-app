// @vitest-environment jsdom
import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useWakeLock } from "../wakeLock";

class FakeLock {
    released = false;
    release = vi.fn(async () => { this.released = true; });
}

let locks: FakeLock[];
let visibility: DocumentVisibilityState;

const settle = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
    locks = [];
    visibility = "visible";
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => visibility });
    Object.defineProperty(navigator, "wakeLock", {
        configurable: true,
        value: { request: vi.fn(async () => { const lock = new FakeLock(); locks.push(lock); return lock; }) },
    });
});

afterEach(() => {
    delete (navigator as any).wakeLock;
    delete (document as any).visibilityState;
});

describe("keeping the screen awake", () => {
    it("holds a lock while active and lets go when no longer active", async () => {
        const { rerender } = renderHook(({ active }) => useWakeLock(active), { initialProps: { active: true } });
        await settle();
        expect(locks).toHaveLength(1);

        rerender({ active: false });

        expect(locks[0].release).toHaveBeenCalled();
    });

    it("takes the lock again when the tab is shown again", async () => {
        renderHook(() => useWakeLock(true));
        await settle();

        // the browser releases the lock while the tab is hidden
        locks[0].released = true;
        visibility = "hidden";
        document.dispatchEvent(new Event("visibilitychange"));
        visibility = "visible";
        document.dispatchEvent(new Event("visibilitychange"));
        await settle();

        expect(locks).toHaveLength(2);
    });

    it("does nothing while not active", async () => {
        renderHook(() => useWakeLock(false));
        await settle();

        expect(locks).toHaveLength(0);
    });
});
