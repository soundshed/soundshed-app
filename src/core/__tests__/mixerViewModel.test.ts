import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  effectiveTrailingZero,
  formatMixerValue,
  MIXER_CHANNELS,
  MIXER_READ_CHANNELS,
  MIXER_READ_SETTLE_MS,
  MIXER_READ_TIMEOUT_MS,
  MixerEvents,
  MixerViewModel,
  mixerValueToPercent,
} from "../mixerViewModel";
import { DeviceContext } from "../deviceContext";
import { MixerStateStore, initialMixerState } from "../../stores/mixerstate";
import { DeviceStateStore } from "../../stores/devicestate";
import { SparkCommandMessage } from "../../spork/src/devices/spark/sparkCommandMessage";
import { blocksToChunks } from "../../spork/src/devices/spark/__tests__/protocolTestUtils";
import { SerialCommsProvider } from "../../spork/src/interfaces/serialCommsProvider";

class FakeEvents implements MixerEvents {
  handlers = new Map<string, (event: any, args: any) => any>();
  invoke = vi.fn(async (_type: string, _data: any): Promise<any> => true);
  on(type: string, action: (event: any, args: any) => any) {
    this.handlers.set(type, action);
  }
  emit(type: string, args: any) {
    this.handlers.get(type)?.(type, args);
  }
}

/** A promise the test resolves by hand, for perform-action calls that are "in flight". */
function deferred<T = any>() {
  let resolve: (v: T) => void = () => {};
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

const setConnected = (connected: boolean) =>
  DeviceStateStore.update((s) => {
    s.isConnected = connected;
  });

const actions = (events: FakeEvents) => events.invoke.mock.calls.map((c) => c[1]);

describe("value helpers", () => {
  it.each([
    [null, null, "—"],
    [undefined, null, "—"],
    [0, 0, "0 %"],
    [0.424, 42, "42 %"],
    [1, 100, "100 %"],
    [1.4, 100, "100 %"],
  ])("%s is %s percent (%s)", (value, percent, label) => {
    expect(mixerValueToPercent(value as any)).toBe(percent);
    expect(formatMixerValue(value as any)).toBe(label);
  });

  it("follows the model for the trailing byte unless set explicitly", () => {
    expect(effectiveTrailingZero(null, true)).toBe(true);
    expect(effectiveTrailingZero(null, false)).toBe(false);
    expect(effectiveTrailingZero(false, true)).toBe(false);
    expect(effectiveTrailingZero(true, false)).toBe(true);
  });
});

describe("MixerViewModel", () => {
  let events: FakeEvents;
  let now: number;
  let vm: MixerViewModel;
  const state = () => MixerStateStore.getRawState();
  const flush = () => vi.advanceTimersByTimeAsync(0);

  beforeEach(() => {
    vi.useFakeTimers();
    setConnected(false);
    MixerStateStore.update((s) => Object.assign(s, initialMixerState()));
    events = new FakeEvents();
    now = 50_000;
    // The read on connect has its own tests below; here it would get in the way.
    vm = new MixerViewModel(events, () => now, { readOnConnect: false });
  });

  afterEach(() => {
    vm.dispose();
    setConnected(false);
    vi.useRealTimers();
  });

  describe("safety", () => {
    it("never sends anything when an amp connects (with the read on connect off)", async () => {
      setConnected(true);
      await flush();
      setConnected(false);
      setConnected(true);
      await flush();

      expect(events.invoke).not.toHaveBeenCalled();
      expect(state().channels).toEqual({});
    });

    it("controls Guitar and Music only; Master is no longer a standard channel", () => {
      expect(MIXER_CHANNELS).toEqual([
        { channel: 0, label: "Guitar" },
        { channel: 5, label: "Music" },
      ]);
      expect(MIXER_READ_CHANNELS).toEqual([0, 5]);
    });

    it("refuses to send or read while disconnected", async () => {
      await expect(vm.setVolume(0, 0.5)).resolves.toBe(false);
      await expect(vm.readMixer()).resolves.toBe(false);

      expect(events.invoke).not.toHaveBeenCalled();
      expect(state().lastError).toMatch(/connect an amp/i);
      expect(state().channels).toEqual({});
    });

    it("rejects an invalid channel or value without sending", async () => {
      setConnected(true);

      await expect(vm.setVolume(128, 0.5)).resolves.toBe(false);
      await expect(vm.setVolume(0, NaN)).resolves.toBe(false);

      expect(events.invoke).not.toHaveBeenCalled();
      expect(state().lastError).toMatch(/invalid/i);
    });
  });

  describe("setVolume", () => {
    beforeEach(() => setConnected(true));

    it("sends setMixerVolume through perform-action and records it", async () => {
      await expect(vm.setVolume(5, 0.25)).resolves.toBe(true);

      expect(events.invoke).toHaveBeenCalledWith("perform-action", {
        action: "setMixerVolume",
        data: { channel: 5, value: 0.25, trailingZero: null },
      });
      expect(state().channels[5]).toMatchObject({ value: 0.25, lastSentValue: 0.25, lastSentAt: now });
    });

    it("clamps the value to 0..1", async () => {
      await vm.setVolume(5, 1.5);
      await vm.setVolume(5, -1);

      expect(actions(events).map((a) => a.data.value)).toEqual([1, 0]);
    });

    it("passes the trailing byte setting on", async () => {
      vm.setTrailingZero(false);
      await vm.setVolume(0, 0.5);
      vm.setTrailingZero(true);
      await vm.setVolume(0, 0.6);

      expect(actions(events).map((a) => a.data.trailingZero)).toEqual([false, true]);
    });

    it("coalesces a drag: one send in flight per channel, the latest value wins", async () => {
      const first = deferred();
      const second = deferred();
      events.invoke
        .mockImplementationOnce(() => first.promise) // guitar 0.1
        .mockImplementationOnce(async () => true) // music 0.9
        .mockImplementationOnce(() => second.promise); // guitar 0.3

      const sent = vm.setVolume(0, 0.1);
      await expect(vm.setVolume(0, 0.2)).resolves.toBe(true);
      await expect(vm.setVolume(0, 0.3)).resolves.toBe(true);
      // another channel is not held up by the guitar drag
      await vm.setVolume(5, 0.9);

      expect(actions(events).map((a) => [a.data.channel, a.data.value])).toEqual([
        [0, 0.1],
        [5, 0.9],
      ]);
      expect(state().channels[0].value).toBe(0.3);

      first.resolve(true);
      await expect(sent).resolves.toBe(true);
      await flush();

      expect(actions(events).map((a) => [a.data.channel, a.data.value])).toEqual([
        [0, 0.1],
        [5, 0.9],
        [0, 0.3],
      ]);
      expect(vm.isSending(0)).toBe(true);

      second.resolve(true);
      await flush();
      expect(vm.isSending(0)).toBe(false);
      expect(state().channels[0].lastSentValue).toBe(0.3);
      expect(events.invoke).toHaveBeenCalledTimes(3);
    });

    it("records an error when the amp could not be written to, and clears it on success", async () => {
      events.invoke.mockResolvedValueOnce(false);
      await expect(vm.setVolume(0, 0.5)).resolves.toBe(false);
      expect(state().lastError).toMatch(/could not send the mixer volume/i);

      events.invoke.mockRejectedValueOnce(new Error("boom"));
      await expect(vm.setVolume(0, 0.5)).resolves.toBe(false);
      expect(state().lastError).toMatch(/could not send/i);

      await expect(vm.setVolume(0, 0.5)).resolves.toBe(true);
      expect(state().lastError).toBeNull();
    });

    it("keeps the tester's trailing byte choice across a disconnect", async () => {
      vm.setTrailingZero(false);
      await vm.setVolume(0, 0.5);

      setConnected(false);
      expect(state()).toEqual({ ...initialMixerState(), trailingZero: false });

      setConnected(true);
      await vm.setVolume(0, 0.6);
      expect(actions(events).filter((a) => a.action == "setMixerVolume").map((a) => a.data.trailingZero)).toEqual([false, false]);
    });

    it("drops the rest of a drag when the amp disconnects", async () => {
      const first = deferred();
      events.invoke.mockImplementationOnce(() => first.promise);

      void vm.setVolume(0, 0.1);
      void vm.setVolume(0, 0.4);
      setConnected(false);
      first.resolve(true);
      await flush();

      expect(events.invoke).toHaveBeenCalledTimes(1);
      expect(state()).toEqual(initialMixerState());
    });
  });

  describe("readMixer", () => {
    beforeEach(() => setConnected(true));

    const reads = () => actions(events).filter((a) => a.action == "getMixerVolume").map((a) => a.data);

    it("asks for guitar and music one at a time and attributes each reply", async () => {
      const done = vm.readMixer();
      await flush();

      expect(reads()).toEqual([0]);
      expect(state().isReading).toBe(true);
      expect(state().channels[0].readStatus).toBe("pending");

      events.emit("mixer-message", { type: "mixer_volume", value: 0.5 });
      await flush();
      expect(state().channels[0]).toMatchObject({ value: 0.5, lastReadValue: 0.5, lastReadAt: now, readStatus: "ok" });
      expect(reads()).toEqual([0, 5]);

      events.emit("mixer-message", { type: "mixer_volume", value: 0.25 });
      await expect(done).resolves.toBe(true);

      expect(reads()).toEqual([0, 5]);
      expect(state().channels[5].value).toBe(0.25);
      expect(state().channels[9]).toBeUndefined();
      expect(state().isReading).toBe(false);
      // reading never writes a value
      expect(actions(events).some((a) => a.action == "setMixerVolume")).toBe(false);
    });

    it("marks a channel that does not answer in time as no reply and moves on", async () => {
      const done = vm.readMixer([0, 5, 9]);
      await flush();

      await vi.advanceTimersByTimeAsync(MIXER_READ_TIMEOUT_MS - 1);
      expect(state().channels[0].readStatus).toBe("pending");
      expect(reads()).toEqual([0]);

      await vi.advanceTimersByTimeAsync(1);
      expect(state().channels[0].readStatus).toBe("no-reply");
      expect(state().channels[0].value).toBeNull();
      // waits for a late reply to drain before asking for the next channel
      expect(reads()).toEqual([0]);
      await vi.advanceTimersByTimeAsync(MIXER_READ_SETTLE_MS);
      expect(reads()).toEqual([0, 5]);

      events.emit("mixer-message", { type: "mixer_volume", value: 0.4 });
      await flush();
      await vi.advanceTimersByTimeAsync(MIXER_READ_TIMEOUT_MS);

      await expect(done).resolves.toBe(true);
      // answered after an earlier timeout, so flagged as possibly that one's late reply
      expect(state().channels[5]).toMatchObject({ readStatus: "ok", readUncertain: true });
      expect(state().channels[9].readStatus).toBe("no-reply");
    });

    it("ignores a late reply that arrives after its request timed out", async () => {
      const done = vm.readMixer([0, 5]);
      await flush();
      await vi.advanceTimersByTimeAsync(MIXER_READ_TIMEOUT_MS);
      expect(state().channels[0].readStatus).toBe("no-reply");

      // ch 0's reply, late: nothing is outstanding during the settle wait
      events.emit("mixer-message", { type: "mixer_volume", value: 0.33 });
      expect(state().channels[5].readStatus).toBe("pending");

      // ch 5's request is registered but still waiting to be written (BLE pacing)
      const write = deferred();
      events.invoke.mockImplementationOnce(() => write.promise);
      await vi.advanceTimersByTimeAsync(MIXER_READ_SETTLE_MS);
      expect(reads()).toEqual([0, 5]);

      events.emit("mixer-message", { type: "mixer_volume", value: 0.34 });
      expect(state().channels[5]).toMatchObject({ value: null, readStatus: "pending" });

      write.resolve(true);
      await flush();
      events.emit("mixer-message", { type: "mixer_volume", value: 0.6 });

      await expect(done).resolves.toBe(true);
      expect(state().channels[5]).toMatchObject({ value: 0.6, lastReadValue: 0.6, readStatus: "ok" });
      expect(state().channels[0]).toMatchObject({ value: null, readStatus: "no-reply" });
    });

    it("does not overwrite a value the user set after the request went out", async () => {
      const send = deferred();
      events.invoke.mockImplementation(async (_t, a) => (a.action == "setMixerVolume" ? send.promise : true));

      const done = vm.readMixer([0, 9]);
      await flush();
      // the user drags guitar while its GET is outstanding; the set is still going out
      void vm.setVolume(0, 0.1);
      events.emit("mixer-message", { type: "mixer_volume", value: 0.9 });
      await flush();

      expect(state().channels[0]).toMatchObject({ value: 0.1, lastReadValue: 0.9, readStatus: "ok" });

      // master: the set has already been written when the stale reply arrives
      send.resolve(true);
      await flush();
      await vm.setVolume(9, 0.2);
      expect(vm.isSending(9)).toBe(false);
      events.emit("mixer-message", { type: "mixer_volume", value: 0.9 });
      await expect(done).resolves.toBe(true);

      expect(state().channels[9]).toMatchObject({ value: 0.2, lastSentValue: 0.2, lastReadValue: 0.9, readStatus: "ok" });
    });

    it("shows a read value when nothing was set since the request", async () => {
      await vm.setVolume(5, 0.1);
      const done = vm.readMixer([5]);
      await flush();
      events.emit("mixer-message", { type: "mixer_volume", value: 0.4 });
      await expect(done).resolves.toBe(true);

      expect(state().channels[5].value).toBe(0.4);
    });

    it("resolves false when nothing answers", async () => {
      const done = vm.readMixer();
      await vi.advanceTimersByTimeAsync(2 * MIXER_READ_TIMEOUT_MS + MIXER_READ_SETTLE_MS + 10);

      await expect(done).resolves.toBe(false);
      expect(state().isReading).toBe(false);
    });

    it("starts the timeout only once the request was written", async () => {
      const write = deferred();
      events.invoke.mockImplementationOnce(() => write.promise);

      void vm.readMixer([0]);
      await vi.advanceTimersByTimeAsync(5 * MIXER_READ_TIMEOUT_MS);
      expect(state().channels[0].readStatus).toBe("pending");

      write.resolve(true);
      await flush();
      events.emit("mixer-message", { type: "mixer_volume", value: 0.6 });
      expect(state().channels[0].readStatus).toBe("ok");
    });

    it("counts a reply that beats the write's promise", async () => {
      const write = deferred();
      events.invoke.mockImplementationOnce(() => write.promise);

      const done = vm.readMixer([9]);
      await flush();
      events.emit("mixer-message", { type: "mixer_volume", value: 0.7 });
      write.resolve(true);

      await expect(done).resolves.toBe(true);
      expect(state().channels[9].readStatus).toBe("ok");
    });

    it("records an error when a request cannot be written", async () => {
      events.invoke.mockResolvedValue(false);

      await expect(vm.readMixer()).resolves.toBe(false);

      expect(state().channels[0].readStatus).toBe("error");
      expect(state().lastError).toMatch(/could not send the mixer read request/i);
    });

    it("does not start a second read while one is running", async () => {
      void vm.readMixer();
      await flush();

      await expect(vm.readMixer()).resolves.toBe(false);
      expect(reads()).toEqual([0]);
    });

    it("ignores a reply nobody asked for, unless it names its channel", () => {
      events.emit("mixer-message", { type: "mixer_volume", value: 0.5 });
      expect(state().channels).toEqual({});

      events.emit("mixer-message", { type: "mixer_volume", value: 0.5, channel: 3 });
      expect(state().channels[3]).toMatchObject({ value: 0.5, readStatus: "ok" });
    });

    it("keeps a named reply from overwriting a channel that is being sent", async () => {
      const send = deferred();
      events.invoke.mockImplementationOnce(() => send.promise);
      void vm.setVolume(3, 0.2);

      events.emit("mixer-message", { type: "mixer_volume", value: 0.8, channel: 3 });
      expect(state().channels[3]).toMatchObject({ value: 0.2, lastReadValue: 0.8 });
      send.resolve(true);
      await flush();
    });

    it("cancels a read when the amp disconnects", async () => {
      const done = vm.readMixer();
      await flush();

      setConnected(false);

      await expect(done).resolves.toBe(false);
      expect(state()).toEqual(initialMixerState());
      expect(reads()).toEqual([0]);
    });
  });

  const sets = () =>
    actions(events)
      .filter((a) => a.action == "setMixerVolume")
      .map((a) => [a.data.channel, a.data.value]);

  describe("toggleMute", () => {
    beforeEach(() => setConnected(true));

    it("mutes by sending 0 and remembering the level, and unmutes by sending it back", async () => {
      await vm.setVolume(0, 0.6);

      await expect(vm.toggleMute(0)).resolves.toBe(true);
      expect(state().channels[0]).toMatchObject({ muted: true, unmuteValue: 0.6, value: 0, lastSentValue: 0 });

      await expect(vm.toggleMute(0)).resolves.toBe(true);
      expect(state().channels[0]).toMatchObject({ muted: false, unmuteValue: null, value: 0.6, lastSentValue: 0.6 });
      expect(sets()).toEqual([
        [0, 0.6],
        [0, 0],
        [0, 0.6],
      ]);
    });

    it("unmuting with no known level only clears the mute and leaves the level at 0", async () => {
      // unknown level
      await vm.toggleMute(5);
      expect(state().channels[5]).toMatchObject({ muted: true, unmuteValue: null, value: 0 });
      await vm.toggleMute(5);
      expect(state().channels[5]).toMatchObject({ muted: false, value: 0 });

      // a level of 0 is not worth going back to either
      await vm.toggleMute(5);
      await vm.toggleMute(5);

      expect(sets()).toEqual([
        [5, 0],
        [5, 0],
      ]);
    });

    it("turning a muted channel unmutes it at the new level", async () => {
      await vm.setVolume(0, 0.5);
      await vm.toggleMute(0);

      await vm.setVolume(0, 0.3);

      expect(state().channels[0]).toMatchObject({ muted: false, unmuteValue: null, value: 0.3 });
      expect(sets()).toEqual([
        [0, 0.5],
        [0, 0],
        [0, 0.3],
      ]);
    });

    it("goes through the coalescing path while a send is in flight", async () => {
      const first = deferred();
      events.invoke.mockImplementationOnce(() => first.promise);

      void vm.setVolume(0, 0.6);
      await expect(vm.toggleMute(0)).resolves.toBe(true);
      expect(sets()).toEqual([[0, 0.6]]);
      expect(state().channels[0]).toMatchObject({ muted: true, unmuteValue: 0.6, value: 0 });

      first.resolve(true);
      await flush();

      expect(sets()).toEqual([
        [0, 0.6],
        [0, 0],
      ]);
      expect(state().channels[0].lastSentValue).toBe(0);
    });

    describe("when the send fails", () => {
      it.each([
        ["resolves false", () => events.invoke.mockResolvedValueOnce(false)],
        ["rejects", () => events.invoke.mockRejectedValueOnce(new Error("GATT write failed"))],
      ])("undoes a mute whose 0 was not written (perform-action %s)", async (_name, fail) => {
        await vm.setVolume(0, 0.6);
        fail();

        await expect(vm.toggleMute(0)).resolves.toBe(false);

        expect(sets()).toEqual([
          [0, 0.6],
          [0, 0],
        ]);
        expect(state().channels[0]).toMatchObject({ muted: false, unmuteValue: null, value: 0.6, sendFailed: true, lastSentValue: 0.6 });
        expect(state().lastError).toMatch(/could not send/i);

        // so the button mutes again (sends 0), and a send that gets through clears the flag
        await expect(vm.toggleMute(0)).resolves.toBe(true);
        expect(state().channels[0]).toMatchObject({ muted: true, unmuteValue: 0.6, value: 0, sendFailed: false });
        expect(state().lastError).toBeNull();
      });

      it.each([
        ["resolves false", () => events.invoke.mockResolvedValueOnce(false)],
        ["rejects", () => events.invoke.mockRejectedValueOnce(new Error("GATT write failed"))],
      ])("undoes an unmute whose level was not written (perform-action %s)", async (_name, fail) => {
        await vm.setVolume(5, 0.6);
        await vm.toggleMute(5);
        fail();

        await expect(vm.toggleMute(5)).resolves.toBe(false);

        expect(state().channels[5]).toMatchObject({ muted: true, unmuteValue: 0.6, value: 0, sendFailed: true });
        // the next click tries the unmute again
        await vm.toggleMute(5);
        expect(sets().slice(-2)).toEqual([
          [5, 0.6],
          [5, 0.6],
        ]);
        expect(state().channels[5]).toMatchObject({ muted: false, value: 0.6, sendFailed: false });
      });

      it("undoes a knob turn that would have unmuted, keeping the level to restore", async () => {
        await vm.setVolume(0, 0.5);
        await vm.toggleMute(0);
        events.invoke.mockResolvedValueOnce(false);

        await vm.setVolume(0, 0.3);

        expect(state().channels[0]).toMatchObject({ muted: true, unmuteValue: 0.5, value: 0 });
      });

      it("keeps a plain level change that failed as it was (no mute involved)", async () => {
        await vm.setVolume(0, 0.5);
        events.invoke.mockResolvedValueOnce(false);

        await vm.setVolume(0, 0.3);

        expect(state().channels[0]).toMatchObject({ value: 0.3, sendFailed: true });
        expect(state().channels[0].muted).toBeFalsy();
      });

      it("undoes a queued mute whose send failed after the one in flight went through", async () => {
        const first = deferred();
        events.invoke.mockImplementationOnce(() => first.promise);
        void vm.setVolume(0, 0.6);
        await vm.toggleMute(0);
        events.invoke.mockResolvedValueOnce(false);

        first.resolve(true);
        await flush();

        expect(sets()).toEqual([
          [0, 0.6],
          [0, 0],
        ]);
        // the amp has 0.6 (the in-flight send), not the 0
        expect(state().channels[0]).toMatchObject({ muted: false, unmuteValue: null, value: 0.6, sendFailed: true, lastSentValue: 0.6 });
      });

      it("keeps a mute whose in-flight predecessor failed but whose own 0 got through", async () => {
        await vm.setVolume(0, 0.4);
        const first = deferred();
        events.invoke.mockImplementationOnce(() => first.promise);
        void vm.setVolume(0, 0.6);
        await vm.toggleMute(0);

        first.resolve(false);
        await flush();

        expect(sets()).toEqual([
          [0, 0.4],
          [0, 0.6],
          [0, 0],
        ]);
        expect(state().channels[0]).toMatchObject({ muted: true, unmuteValue: 0.6, value: 0, sendFailed: false, lastSentValue: 0 });
      });

      it("undoes the mute when both the in-flight and the queued send fail", async () => {
        await vm.setVolume(0, 0.4);
        const first = deferred();
        events.invoke.mockImplementationOnce(() => first.promise);
        void vm.setVolume(0, 0.6);
        await vm.toggleMute(0);
        events.invoke.mockResolvedValueOnce(false);

        first.resolve(false);
        await flush();

        // the amp still has 0.4, the last level that got through
        expect(state().channels[0]).toMatchObject({ muted: false, unmuteValue: null, value: 0.4, sendFailed: true });
      });
    });

    it("refuses while disconnected", async () => {
      setConnected(false);
      await expect(vm.toggleMute(0)).resolves.toBe(false);
      expect(events.invoke).not.toHaveBeenCalled();
      expect(state().lastError).toMatch(/connect an amp/i);
    });

    it("is cleared by a 03 6B guitar level above 0, not by one of 0", async () => {
      await vm.setVolume(0, 0.5);
      await vm.toggleMute(0);

      events.emit("mixer-message", { type: "input_volume", value: 0 });
      expect(state().channels[0]).toMatchObject({ muted: true, unmuteValue: 0.5, value: 0 });

      events.emit("mixer-message", { type: "input_volume", value: 0.4 });
      expect(state().channels[0]).toMatchObject({ muted: false, unmuteValue: null, value: 0.4 });
    });

    it("is cleared by a read reply above 0, kept by a reply of 0 or a stale one", async () => {
      await vm.setVolume(5, 0.7);
      await vm.toggleMute(5);

      let done = vm.readMixer([5]);
      await flush();
      events.emit("mixer-message", { type: "mixer_volume", value: 0 });
      await done;
      expect(state().channels[5]).toMatchObject({ muted: true, unmuteValue: 0.7 });

      // muted again after the request went out: the reply is from before the mute
      await vm.toggleMute(5);
      done = vm.readMixer([5]);
      await flush();
      await vm.toggleMute(5);
      events.emit("mixer-message", { type: "mixer_volume", value: 0.7 });
      await done;
      expect(state().channels[5]).toMatchObject({ muted: true, unmuteValue: 0.7, value: 0 });

      done = vm.readMixer([5]);
      await flush();
      events.emit("mixer-message", { type: "mixer_volume", value: 0.2 });
      await done;
      expect(state().channels[5]).toMatchObject({ muted: false, unmuteValue: null, value: 0.2 });
    });
  });

  describe("read on connect and mutes over a reconnect", () => {
    const reads = () => actions(events).filter((a) => a.action == "getMixerVolume").map((a) => a.data);

    const connectTo = (address: string | null) =>
      DeviceStateStore.update((s) => {
        s.connectedDevice = address == null ? null : { name: "Spark 2", address };
        s.isConnected = true;
      });

    /** Answers the outstanding reads in order; null lets that one time out. */
    const answer = async (...values: Array<number | null>) => {
      for (const v of values) {
        await flush();
        if (v == null) await vi.advanceTimersByTimeAsync(MIXER_READ_TIMEOUT_MS + MIXER_READ_SETTLE_MS);
        else events.emit("mixer-message", { type: "mixer_volume", value: v });
      }
      await flush();
    };

    /** Connected to amp A, guitar at 0.5 and muted, then the link drops. */
    const muteGuitarAndDrop = async () => {
      connectTo("A");
      await answer(0.5, 0.7);
      await vm.toggleMute(0);
      setConnected(false);
      expect(state().channels).toEqual({});
      events.invoke.mockClear();
    };

    beforeEach(() => {
      vm.dispose();
      vm = new MixerViewModel(events, () => now);
    });

    afterEach(() =>
      DeviceStateStore.update((s) => {
        s.connectedDevice = null;
      })
    );

    it("reads guitar and music once when an amp connects, and sends no value", async () => {
      connectTo("A");
      await answer(0.4, 0.6);

      expect(reads()).toEqual([0, 5]);
      expect(sets()).toEqual([]);
      expect(state().channels[0]).toMatchObject({ value: 0.4, readStatus: "ok" });
      expect(state().channels[5]).toMatchObject({ value: 0.6, readStatus: "ok" });
      expect(state().isReading).toBe(false);
    });

    it("keeps a mute over a reconnect of the same amp when it still reads 0", async () => {
      await muteGuitarAndDrop();

      connectTo("A");
      expect(state().channels[0]).toMatchObject({ muted: true, unmuteValue: 0.5 });
      await answer(0, 0.7);

      expect(state().channels[0]).toMatchObject({ muted: true, unmuteValue: 0.5, value: 0 });
      expect(sets()).toEqual([]);

      await vm.toggleMute(0);
      expect(sets()).toEqual([[0, 0.5]]);
    });

    it("keeps the mute when the amp does not answer the read", async () => {
      await muteGuitarAndDrop();

      connectTo("A");
      await answer(null, 0.7);

      expect(state().channels[0]).toMatchObject({ muted: true, unmuteValue: 0.5, readStatus: "no-reply" });
    });

    it("clears the mute when the same amp reads above 0 after reconnecting", async () => {
      await muteGuitarAndDrop();

      connectTo("A");
      await answer(0.3, 0.7);

      expect(state().channels[0]).toMatchObject({ muted: false, unmuteValue: null, value: 0.3 });
    });

    it.each([
      ["another amp", "B"],
      ["an amp without an address", null],
    ])("drops the mute when %s connects", async (_name, address) => {
      await muteGuitarAndDrop();

      connectTo(address);
      expect(state().channels[0]?.muted).toBeFalsy();
      await answer(0, 0.7);
      expect(state().channels[0]?.muted).toBeFalsy();

      // so the button mutes (sends 0) rather than restoring A's level
      await vm.toggleMute(0);
      expect(sets()).toEqual([[0, 0]]);
    });

    it("does not let an uncertain read reply (maybe another channel's late one) end a held mute", async () => {
      // Music muted at 0.6, then the link drops
      connectTo("A");
      await answer(0.7, 0.6);
      await vm.toggleMute(5);
      setConnected(false);
      events.invoke.mockClear();

      connectTo("A");
      expect(state().channels[5]).toMatchObject({ muted: true, unmuteValue: 0.6 });
      // Guitar's reply is late: it times out, and arrives after the Music request went out
      await flush();
      await vi.advanceTimersByTimeAsync(MIXER_READ_TIMEOUT_MS + MIXER_READ_SETTLE_MS);
      await flush();
      expect(reads()).toEqual([0, 5]);
      events.emit("mixer-message", { type: "mixer_volume", value: 0.7 });
      await flush();

      expect(state().channels[5]).toMatchObject({
        muted: true,
        unmuteValue: 0.6,
        readUncertain: true,
        lastReadValue: 0.7,
      });
      // the uncertain 0.7 is not taken as Music's level
      expect(state().channels[5].value).not.toBe(0.7);
      expect(sets()).toEqual([]);

      // unmuting still goes back to the remembered level
      await vm.toggleMute(5);
      expect(sets()).toEqual([[5, 0.6]]);
    });

    it("forgets the held mute once it was dealt with", async () => {
      await muteGuitarAndDrop();
      connectTo("B");
      await answer(0.2, 0.7);
      setConnected(false);

      connectTo("A");
      expect(state().channels[0]?.muted).toBeFalsy();
      await answer(0, 0.7);
    });
  });

  describe("notifications from the amp", () => {
    beforeEach(() => setConnected(true));

    it("counts acks", () => {
      events.emit("mixer-message", { type: "mixer_ack", value: true });
      now += 10;
      events.emit("mixer-message", { type: "mixer_ack", value: true });

      expect(state().ackCount).toBe(2);
      expect(state().lastAckAt).toBe(now);
    });

    it("shows the input volume (0x03 0x6b) on the guitar channel", () => {
      events.emit("mixer-message", { type: "input_volume", value: 0.35 });

      expect(state().lastInputVolume).toBe(0.35);
      expect(state().lastInputVolumeAt).toBe(now);
      expect(state().channels[0].value).toBe(0.35);
    });

    it("does not move the guitar value while the user is changing it", async () => {
      const send = deferred();
      events.invoke.mockImplementationOnce(() => send.promise);
      void vm.setVolume(0, 0.8);

      events.emit("mixer-message", { type: "input_volume", value: 0.2 });

      expect(state().lastInputVolume).toBe(0.2);
      expect(state().channels[0].value).toBe(0.8);
      send.resolve(true);
      await flush();
    });

    it("ignores messages that are not mixer messages", () => {
      vm.handleMessage({ type: "hardware_bpm", value: 120 });
      vm.handleMessage(null);
      vm.handleMessage({ type: "input_volume", value: "loud" });

      expect(state()).toEqual(initialMixerState());
    });
  });
});

class QuietProvider implements SerialCommsProvider {
  written: Uint8Array[] = [];
  onDisconnected: (() => void) | null = null;
  async disconnect(): Promise<void> {}
  async connect(): Promise<boolean> {
    return true;
  }
  async scanForDevices(): Promise<any> {
    return [];
  }
  async beginQueuedReceive(): Promise<boolean> {
    return true;
  }
  readReceiveQueue(): Array<Uint8Array> {
    return null;
  }
  peekReceiveQueueEnd(): Uint8Array {
    return null;
  }
  async write(buffer): Promise<void> {
    this.written.push(new Uint8Array(buffer));
  }
  isSpark2Connection(): boolean {
    return false;
  }
}

describe("DeviceContext mixer routing", () => {
  it("forwards mixer messages from the amp as mixer-message only", async () => {
    const sent: { type: string; args: any }[] = [];
    const context = new DeviceContext();
    context.init(new QuietProvider(), (type, args) => sent.push({ type, args }));

    const reply = new SparkCommandMessage();
    reply.start_message(0x03, 0x6b);
    reply.add_float(0.5);

    await context.deviceManager.readStateMessage([
      ...blocksToChunks(reply.end_message()),
      Uint8Array.from([0xf0, 0x01, 0x3a, 0x15, 0x04, 0x33, 0xf7]),
    ]);

    expect(sent).toEqual([
      { type: "mixer-message", args: { type: "input_volume", value: 0.5 } },
      { type: "mixer-message", args: { type: "mixer_ack", value: true } },
    ]);
    await context.deviceManager.disconnect();
  });

  it("handles setMixerVolume and getMixerVolume by writing the mixer frames", async () => {
    const provider = new QuietProvider();
    const context = new DeviceContext();
    context.init(provider, () => {});

    await expect(
      context.performAction({ action: "setMixerVolume", data: { channel: 5, value: 0.25, trailingZero: true } })
    ).resolves.toBe(true);
    await expect(context.performAction({ action: "getMixerVolume", data: 9 })).resolves.toBe(true);
    // null follows the model: no trailing byte on this (non Spark 2) amp
    await context.performAction({ action: "setMixerVolume", data: { channel: 0, value: 0.5, trailingZero: null } });

    expect(provider.written.map((w) => Array.from(w))).toEqual(
      [
        ...new SparkCommandMessage().set_mixer_volume(5, 0.25, true),
        ...new SparkCommandMessage().request_mixer_volume(9),
        ...new SparkCommandMessage().set_mixer_volume(0, 0.5, false),
      ].map((b) => Array.from(b))
    );
  });

  it("setMixerVolume resolves false through the view model when the write fails", async () => {
    const provider = new QuietProvider();
    provider.write = async () => {
      throw new Error("GATT write failed");
    };
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const context = new DeviceContext();
    context.init(provider, () => {});

    const events = new FakeEvents();
    events.invoke.mockImplementation((_type, data) => context.performAction(data));
    MixerStateStore.update((s) => Object.assign(s, initialMixerState()));
    setConnected(true);
    const vm = new MixerViewModel(events);

    await expect(vm.setVolume(0, 0.5)).resolves.toBe(false);
    expect(MixerStateStore.getRawState().lastError).not.toBeNull();

    vm.dispose();
    setConnected(false);
    warn.mockRestore();
  });
});
