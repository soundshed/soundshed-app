import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BleProvider } from "../bleProvider";
import { SparkCommandMessage } from "../sparkCommandMessage";
import { SparkMessageReader } from "../sparkMessageReader";
import { countCompleteMessages, readMultiChunkPosition, SparkReceiveQueue } from "../sparkReceiveQueue";
import { blocksToChunks, buildTestPreset } from "./protocolTestUtils";

// Reported on a real Spark 2: "the tuner does not work". While the tuner is on the amp
// sends a reading (0x03 0x64) about every 60 ms, and the BLE transport only handed its
// queue over after 300 ms without any notification, so nothing was ever delivered and
// nothing could be sent either.

const hex = (s: string) => Uint8Array.from(s.replace(/ /g, "").match(/../g).map((b) => parseInt(b, 16)));

/** A tuner reading as a Spark 2 notifies it (TominoCZ/Flint capture): note 0, offset -1.0 = no signal. */
const NO_SIGNAL_READING = hex("f0 01 51 7b 03 64 0e 00 4a 3f 00 00 00 f7");

/** A tuner reading built with the app's encoder, inside a block header. */
function readingBlock(note: number, offset: number): Uint8Array {
    const msg = new SparkCommandMessage();
    msg.start_message(0x03, 0x64);
    msg.add_bytes(Uint8Array.from([note]));
    msg.add_float(offset);
    return msg.end_message()[0];
}

/** A preset in three chunks (the reader treats cmd 0x01 and 0x03 sub 0x01 the same). */
function presetChunks(): Uint8Array[] {
    return blocksToChunks(new SparkCommandMessage().create_preset(buildTestPreset()));
}

/** Another preset (a different name), so its chunks differ from presetChunks(). */
function otherPresetChunks(): Uint8Array[] {
    return blocksToChunks(new SparkCommandMessage().create_preset(buildTestPreset({ Name: "Other Tone" })));
}

/** A synthetic chunk of a multi-chunk preset reply (only its numbering matters to the queue). */
function numberedChunk(index: number, count: number): Uint8Array {
    return hex(`f0 01 ${(index & 0x7f).toString(16).padStart(2, "0")} 00 03 01 00 ${count.toString(16).padStart(2, "0")} ${index.toString(16).padStart(2, "0")} 10 00 f7`);
}

/** Splits a chunk into BLE notifications of at most 20 bytes. */
function notifications(data: Uint8Array, size = 20): Uint8Array[] {
    const out: Uint8Array[] = [];
    for (let i = 0; i < data.length; i += size) out.push(data.slice(i, i + size));
    return out;
}

function parse(batch: Uint8Array[]) {
    const reader = new SparkMessageReader();
    reader.set_message(batch);
    reader.read_message();
    return { messages: reader.readMessageQueue(), incomplete: reader.incompleteMessage };
}

describe("finding whole messages in the receive queue", () => {
    it("reads the chunk count and index of a multi-chunk message", () => {
        const chunks = presetChunks();
        expect(chunks).toHaveLength(3);
        expect(chunks.map(readMultiChunkPosition)).toEqual([
            { index: 0, count: 3 },
            { index: 1, count: 3 },
            { index: 2, count: 3 },
        ]);
    });

    it("applies the high bits of the 7-bit encoding", () => {
        const chunk = hex("f0 01 3a 00 03 01 03 00 05 10 00 f7");
        expect(readMultiChunkPosition(chunk)).toEqual({ count: 0x80, index: 0x85 });
    });

    it("treats tuner readings, acks and broken pieces as single-chunk messages", () => {
        expect(readMultiChunkPosition(NO_SIGNAL_READING)).toBeNull();
        expect(readMultiChunkPosition(hex("f0 01 01 00 04 65 f7"))).toBeNull();
        expect(readMultiChunkPosition(hex("3a 3f 00 f7"))).toBeNull();
    });

    it("counts everything when the queue holds only single-chunk messages", () => {
        expect(countCompleteMessages([NO_SIGNAL_READING, NO_SIGNAL_READING, NO_SIGNAL_READING])).toBe(3);
    });

    it("stops before a multi-chunk message whose last chunk is missing", () => {
        const [p0, p1, p2] = presetChunks();
        expect(countCompleteMessages([NO_SIGNAL_READING, p0, p1])).toBe(1);
        expect(countCompleteMessages([NO_SIGNAL_READING, p0, p1, p2])).toBe(4);
    });

    it("keeps single-chunk messages that arrive inside a multi-chunk message with it", () => {
        const [p0, p1, p2] = presetChunks();
        const r = NO_SIGNAL_READING;
        expect(countCompleteMessages([r, p0, r, p1, r])).toBe(1);
        expect(countCompleteMessages([r, p0, r, p1, r, p2, r])).toBe(7);
    });

    it("lets the first chunk of a new message end an earlier one whose last chunk was lost", () => {
        const [a0, a1] = presetChunks();
        const [b0, b1, b2] = otherPresetChunks();
        const r = NO_SIGNAL_READING;
        // a0 a1 (a2 lost) r | b0 b1 ... : everything before b0 is as whole as it gets
        expect(countCompleteMessages([a0, a1, r, b0, b1])).toBe(3);
        expect(countCompleteMessages([a0, a1, r, b0, r, b1, b2, r])).toBe(8);
    });
});

describe("SparkReceiveQueue", () => {
    let now: number;
    let queue: SparkReceiveQueue;

    beforeEach(() => {
        now = 1000;
        queue = new SparkReceiveQueue({ now: () => now, maxIncompleteWaitMs: 1500 });
    });

    it("hands over whole messages while the line is busy", () => {
        queue.push(NO_SIGNAL_READING);
        expect(queue.take(false)).toEqual([NO_SIGNAL_READING]);
        expect(queue.take(false)).toBeNull();
    });

    it("keeps an unfinished multi-chunk message queued until its last chunk arrives", () => {
        const [p0, p1, p2] = presetChunks();
        queue.push(NO_SIGNAL_READING);
        queue.push(p0);
        queue.push(p1);

        expect(queue.take(false)).toEqual([NO_SIGNAL_READING]);
        expect(queue.take(false)).toBeNull();
        expect(queue.length).toBe(2);

        queue.push(p2);
        expect(queue.take(false)).toEqual([p0, p1, p2]);
        expect(queue.length).toBe(0);
    });

    it("still releases an unfinished message once the line is quiet (the old rule)", () => {
        const [p0, p1] = presetChunks();
        queue.push(p0);
        queue.push(p1);

        expect(queue.take(true)).toEqual([p0, p1]);
    });

    it("releases an unfinished message after maxIncompleteWaitMs even if the line stays busy", () => {
        const [p0, p1] = presetChunks();
        queue.push(p0);
        queue.push(p1);
        expect(queue.take(false)).toBeNull();

        for (let i = 0; i < 20; i++) {
            now += 60;
            queue.push(NO_SIGNAL_READING);
            expect(queue.take(false)).toBeNull();
        }

        now += 400;
        const batch = queue.take(false);
        expect(batch.slice(0, 2)).toEqual([p0, p1]);
        expect(batch).toHaveLength(22);
        expect(parse(batch).incomplete).toBe(true);
    });

    it("does not cut a long reply that keeps arriving steadily (17 chunks, one every 100 ms)", () => {
        const batches: Uint8Array[][] = [];
        const chunks = Array.from({ length: 17 }, (_, i) => numberedChunk(i, 17));
        // the read loop polls every 50 ms; a chunk arrives every other poll
        for (let t = 0; t <= 1800; t += 50) {
            if (t % 100 == 0 && t / 100 < chunks.length) queue.push(chunks[t / 100]);
            const batch = queue.take(false);
            if (batch) batches.push(batch);
            now += 50;
        }

        expect(batches).toEqual([chunks]);
    });

    it("does not cut a preset whose chunks are spread over more than maxIncompleteWaitMs", () => {
        const [p0, p1, p2] = presetChunks();
        const batches: Uint8Array[][] = [];
        const poll = () => {
            const batch = queue.take(false);
            if (batch) batches.push(batch);
        };
        // a chunk every 800 ms, with readings every 60 ms in between
        for (const chunk of [p0, p1, p2]) {
            queue.push(chunk);
            for (let i = 0; i < 13; i++) {
                now += 60;
                queue.push(NO_SIGNAL_READING);
                poll();
            }
        }
        poll();

        const presetBatches = batches.filter((b) => b.some((c) => readMultiChunkPosition(c) != null));
        expect(presetBatches).toHaveLength(1);
        const parsed = parse(presetBatches[0]);
        expect(parsed.incomplete).toBe(false);
        expect(parsed.messages.filter((m) => m.type === "preset")).toHaveLength(1);
    });

    it("delivers a whole preset that starts while an earlier one lost its last chunk", () => {
        // the reviewer's case: P1 loses chunk 2, P2 starts at 1.40 s and finishes at 1.60 s
        const [a0, a1] = presetChunks();
        const [b0, b1, b2] = otherPresetChunks();
        const arrivals = new Map<number, Uint8Array>([[0, a0], [50, a1], [1400, b0], [1450, b1], [1600, b2]]);
        const batches: Uint8Array[][] = [];

        const start = now;
        for (let t = 0; t <= 2000; t += 10) {
            now = start + t;
            if (arrivals.has(t)) queue.push(arrivals.get(t));
            if (t % 60 == 30) queue.push(NO_SIGNAL_READING);
            if (t % 50 == 0) {
                const batch = queue.take(false);
                if (batch) batches.push(batch);
            }
        }

        const withPreset = batches.filter((b) => b.some((c) => readMultiChunkPosition(c) != null));
        // P1's broken pieces go out as soon as P2 starts; P2 goes out whole
        expect(withPreset).toHaveLength(2);
        expect(withPreset[0].filter((c) => readMultiChunkPosition(c) != null)).toEqual([a0, a1]);
        expect(parse(withPreset[0]).incomplete).toBe(true);
        expect(withPreset[1].filter((c) => readMultiChunkPosition(c) != null)).toEqual([b0, b1, b2]);
        const second = parse(withPreset[1]);
        expect(second.incomplete).toBe(false);
        expect(second.messages.filter((m) => m.type === "preset")).toMatchObject([{ type: "preset" }]);
        expect(queue.length).toBe(0);
    });

    it("restarts the wait for each new unfinished message", () => {
        const [p0, p1, p2] = presetChunks();
        queue.push(p0);
        expect(queue.take(false)).toBeNull();
        now += 1000;
        queue.push(p1);
        queue.push(p2);
        expect(queue.take(false)).toEqual([p0, p1, p2]);

        queue.push(p0);
        now += 1000;
        expect(queue.take(false)).toBeNull();
    });

    it("is bounded, dropping the oldest tuner readings first", () => {
        queue = new SparkReceiveQueue({ maxLength: 16 });
        const [p0] = presetChunks();
        queue.push(p0);
        const readings = Array.from({ length: 30 }, (_, i) => blocksToChunks([readingBlock(i % 12, 0.5)])[0]);
        readings.forEach((r) => queue.push(r));

        expect(queue.length).toBe(16);
        expect(queue.droppedCount).toBe(15);
        expect(queue.take(true)).toEqual([p0, ...readings.slice(15)]);
    });

    it("drops the oldest entry when there is no tuner reading to drop", () => {
        queue = new SparkReceiveQueue({ maxLength: 16 });
        const ack = (n: number) => hex(`f0 01 ${n.toString(16).padStart(2, "0")} 00 04 15 f7`);
        for (let i = 0; i < 20; i++) queue.push(ack(i));

        expect(queue.length).toBe(16);
        expect(queue.take(false)[0]).toEqual(ack(4));
    });

    it("peekEnd returns null for an empty queue instead of throwing", () => {
        expect(queue.peekEnd()).toBeNull();
        queue.push(NO_SIGNAL_READING);
        expect(queue.peekEnd()).toBe(NO_SIGNAL_READING);
    });
});

describe("BleProvider while the tuner streams readings", () => {
    let provider: any;

    beforeEach(() => {
        vi.useFakeTimers();
        provider = new BleProvider();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    /** Polls the queue every 50 ms like SparkDeviceManager's read loop. */
    function startReadLoop(batches: Uint8Array[][]) {
        return setInterval(() => {
            const batch = provider.readReceiveQueue();
            if (batch) batches.push(batch);
        }, 50);
    }

    it("delivers a reading sent every 60 ms message by message", async () => {
        const batches: Uint8Array[][] = [];
        const loop = startReadLoop(batches);

        let sent = 0;
        const amp = setInterval(() => {
            provider.handleAndQueueMessageData(sent % 2 ? NO_SIGNAL_READING : readingBlock(9, 0.5));
            sent++;
        }, 60);

        let maxQueued = 0;
        for (let t = 0; t < 3000; t += 10) {
            await vi.advanceTimersByTimeAsync(10);
            maxQueued = Math.max(maxQueued, provider.receiveQueue.length);
        }
        clearInterval(amp);
        clearInterval(loop);

        const delivered = batches.flat();
        expect(sent).toBeGreaterThanOrEqual(49);
        expect(delivered.length).toBeGreaterThanOrEqual(sent - 1);
        expect(Math.max(...batches.map((b) => b.length))).toBe(1);
        expect(maxQueued).toBeLessThanOrEqual(1);

        const parsed = parse(delivered);
        expect(parsed.incomplete).toBe(false);
        expect(parsed.messages.every((m) => m.type === "tuner_output")).toBe(true);
        expect(parsed.messages[1]).toMatchObject({ type: "tuner_output", note: 0, offset: -1 });
    });

    it("never splits a preset reply that arrives in the middle of the stream", async () => {
        const batches: Uint8Array[][] = [];
        const loop = startReadLoop(batches);

        // readings every 60 ms; the preset's chunks come in 20-byte notifications with
        // readings (and a whole poll interval) between them
        const incoming: Uint8Array[] = [];
        const preset = presetChunks();
        for (let i = 0; i < 5; i++) incoming.push(readingBlock(9, 0.5));
        for (const chunk of preset) {
            incoming.push(...notifications(chunk));
            incoming.push(readingBlock(4, 0.4), readingBlock(4, 0.45));
        }
        for (let i = 0; i < 5; i++) incoming.push(readingBlock(9, 0.5));

        for (const n of incoming) {
            provider.handleAndQueueMessageData(n);
            await vi.advanceTimersByTimeAsync(60);
        }
        await vi.advanceTimersByTimeAsync(60);
        clearInterval(loop);

        const presetBatches = batches.filter((b) => b.some((c) => readMultiChunkPosition(c) != null));
        expect(presetBatches).toHaveLength(1);
        expect(presetBatches[0].filter((c) => readMultiChunkPosition(c) != null)).toEqual(preset);

        for (const batch of batches) {
            expect(parse(batch).incomplete).toBe(false);
        }

        const types = batches.flatMap((b) => parse(b).messages.map((m) => m.type));
        expect(types.filter((t) => t === "preset")).toHaveLength(1);
        expect(types.filter((t) => t === "tuner_output")).toHaveLength(16);
        // the readings before the preset were not held back for it
        expect(batches.slice(0, 5).flat()).toHaveLength(5);
    });

    it("keeps a preset whose end has not arrived queued while readings keep coming", async () => {
        const batches: Uint8Array[][] = [];
        const loop = startReadLoop(batches);
        const [p0, p1] = presetChunks();

        provider.handleAndQueueMessageData(p0);
        provider.handleAndQueueMessageData(p1);
        for (let i = 0; i < 10; i++) {
            provider.handleAndQueueMessageData(readingBlock(9, 0.5));
            await vi.advanceTimersByTimeAsync(60);
        }
        clearInterval(loop);

        expect(batches).toEqual([]);
        expect(provider.receiveQueue.length).toBe(12);
    });

    it("bounds the receive queue when nothing reads it", () => {
        for (let i = 0; i < 1000; i++) provider.handleAndQueueMessageData(NO_SIGNAL_READING);

        expect(provider.receiveQueue.length).toBe(SparkReceiveQueue.DEFAULT_MAX_LENGTH);
    });
});

describe("BleProvider.write while the tuner streams readings", () => {
    let provider: any;
    let writes: { at: number; bytes: number[] }[];
    let start: number;

    beforeEach(() => {
        vi.useFakeTimers();
        provider = new BleProvider();
        writes = [];
        start = Date.now();
        provider.commandCharacteristic = {
            writeValueWithoutResponse: async (b: Uint8Array) => {
                writes.push({ at: Date.now() - start, bytes: Array.from(b) });
            },
        };
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    /** An ack as the amp sends it: a whole message that is not a tuner reading. */
    const ACK = hex("f0 01 01 00 04 38 f7");

    it("sends commands although the line never goes quiet (tuner readings do not hold them back)", async () => {
        const amp = setInterval(() => provider.handleAndQueueMessageData(NO_SIGNAL_READING), 60);

        const off = new SparkCommandMessage().switch_tuner(false)[0];
        const name = new SparkCommandMessage().request_info(0x11)[0];
        const sent = Promise.all([provider.write(off), provider.write(name)]);

        await vi.advanceTimersByTimeAsync(2500);
        await sent;
        clearInterval(amp);

        expect(writes.map((w) => w.bytes)).toEqual([Array.from(off), Array.from(name)]);
        // only the 500 ms gap between commands, no wait for the readings to stop
        expect(writes[0].at).toBeLessThanOrEqual(550);
        expect(writes[1].at - writes[0].at).toBeGreaterThanOrEqual(500);
        expect(writes[1].at - writes[0].at).toBeLessThanOrEqual(600);
    });

    it("does not count tuner readings split over 20-byte notifications as a reply", async () => {
        provider.lastMsgSentTime = new Date(start - 10_000);
        const reading = notifications(readingBlock(9, 0.5));
        expect(reading.length).toBeGreaterThan(1);
        const amp = setInterval(() => reading.forEach((n) => provider.handleAndQueueMessageData(n)), 60);

        const sent = provider.write(new SparkCommandMessage().request_info(0x11)[0]);
        await vi.advanceTimersByTimeAsync(500);
        await sent;
        clearInterval(amp);

        expect(writes).toHaveLength(1);
        expect(writes[0].at).toBeLessThanOrEqual(50);
    });

    it("still waits for a short burst of notifications to finish", async () => {
        provider.lastMsgSentTime = new Date(start - 10_000);
        // a reply whose notifications stop 200 ms from now
        const burst = setInterval(() => provider.handleAndQueueMessageData(ACK), 20);
        setTimeout(() => clearInterval(burst), 200);
        // the command is queued once the reply has started
        await vi.advanceTimersByTimeAsync(30);

        const sent = provider.write(new SparkCommandMessage().request_info(0x11)[0]);
        await vi.advanceTimersByTimeAsync(1500);
        await sent;

        expect(writes).toHaveLength(1);
        // sent once 300 ms had passed after the last notification, not straight away
        expect(writes[0].at).toBeGreaterThanOrEqual(480);
        expect(writes[0].at).toBeLessThanOrEqual(600);
    });

    it("waits for a long preset reply to finish even while the tuner streams", async () => {
        provider.lastMsgSentTime = new Date(start - 10_000);
        const amp = setInterval(() => provider.handleAndQueueMessageData(NO_SIGNAL_READING), 60);
        // a preset reply in 20-byte notifications, one every 40 ms, for about 1.2 s
        const reply: Uint8Array[] = [];
        while (reply.length < 30) {
            for (const block of new SparkCommandMessage().create_preset(buildTestPreset())) reply.push(...notifications(block));
        }
        reply.length = 30;
        let next = 0;
        const replyTimer = setInterval(() => {
            if (next < reply.length) provider.handleAndQueueMessageData(reply[next++]);
        }, 40);
        await vi.advanceTimersByTimeAsync(100);

        const sent = provider.write(new SparkCommandMessage().request_info(0x11)[0]);
        await vi.advanceTimersByTimeAsync(2500);
        await sent;
        clearInterval(amp);
        clearInterval(replyTimer);

        expect(writes).toHaveLength(1);
        // the last notification of the reply arrives at 1200 ms; sent 300 ms after it
        expect(writes[0].at).toBeGreaterThanOrEqual(1480);
        expect(writes[0].at).toBeLessThanOrEqual(1600);
    });

    it("sends anyway once the line has stayed busy for the safety cap", async () => {
        provider.lastMsgSentTime = new Date(start - 10_000);
        const busy = setInterval(() => provider.handleAndQueueMessageData(ACK), 50);
        await vi.advanceTimersByTimeAsync(100);

        const sent = provider.write(new SparkCommandMessage().request_info(0x11)[0]);
        await vi.advanceTimersByTimeAsync(3000);
        await sent;
        clearInterval(busy);

        expect(writes).toHaveLength(1);
        // queued at 100 ms, given up waiting 2 s later
        expect(writes[0].at).toBeGreaterThanOrEqual(2100);
        expect(writes[0].at).toBeLessThanOrEqual(2200);
    });
});
