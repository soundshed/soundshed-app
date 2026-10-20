import { describe, expect, it } from "vitest";
import { PlatformEvents } from "../utils";

describe("PlatformEvents.invoke", () => {
  it("waits for an async handler to finish before resolving", async () => {
    const events = new PlatformEvents();
    let finished = false;

    events.on("act", async () => {
      await new Promise((r) => setTimeout(r, 20));
      finished = true;
    });

    await events.invoke("act", null);

    // Before the fix this resolved immediately, letting callers fire follow-up
    // hardware commands while the previous one was still in flight.
    expect(finished).toBe(true);
  });

  it("resolves with the handler's return value", async () => {
    const events = new PlatformEvents();
    events.on("act", async () => false);

    await expect(events.invoke("act", null)).resolves.toBe(false);
  });

  it("resolves true when the handler returns nothing", async () => {
    const events = new PlatformEvents();
    events.on("act", () => {});

    await expect(events.invoke("act", null)).resolves.toBe(true);
  });

  it("resolves false when the handler throws", async () => {
    const events = new PlatformEvents();
    events.on("act", () => {
      throw new Error("boom");
    });

    await expect(events.invoke("act", null)).resolves.toBe(false);
  });

  it("resolves false when an async handler rejects", async () => {
    const events = new PlatformEvents();
    events.on("act", async () => {
      throw new Error("boom");
    });

    await expect(events.invoke("act", null)).resolves.toBe(false);
  });

  it("resolves true when no handler is registered", async () => {
    const events = new PlatformEvents();

    await expect(events.invoke("nothing-listening", null)).resolves.toBe(true);
  });

  it("passes the event type and payload to the handler", async () => {
    const events = new PlatformEvents();
    const seen: any[] = [];
    events.on("act", (type, args) => {
      seen.push([type, args]);
    });

    await events.invoke("act", { channel: 3 });

    expect(seen).toEqual([["act", { channel: 3 }]]);
  });
});
