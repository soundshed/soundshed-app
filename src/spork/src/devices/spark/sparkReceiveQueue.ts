// Receive queue shared by the BLE and TCP transports.
//
// Each entry is one Spark chunk with any 16-byte block header already removed:
//
//   f0 01 <seq> <checksum> <cmd> <sub> <7-bit data ...> f7
//
// The 7-bit data comes in groups of up to 8 bytes: a byte holding the high bits of
// the (up to) 7 bytes that follow. A preset (cmd 0x01 or 0x03 with sub 0x01) is
// split over several chunks, and every one of them starts its 8-bit data with
// <chunk count> <chunk index> <length>. SparkMessageReader.structure_data glues
// those chunks back together, but only within one batch: a preset whose chunks
// are split over two batches is reported as incomplete and thrown away. Every
// other message fits in a single chunk.
//
// The transports used to hand over the whole queue only once the line had been
// quiet for a while (300 ms over BLE). While the amp's tuner is on it sends a
// reading (0x03 0x64) about every 60 ms, so the line is never quiet: nothing was
// ever delivered and the queue grew without bound. Instead the queue is now handed
// over as far as it holds whole messages. The chunk numbering above tells exactly
// when a preset is whole (its last chunk has arrived), so a preset is never split
// over two batches, and readings streamed around it are delivered as they come.
// Whatever follows the start of an unfinished preset stays queued (in order) until
// the preset is finished. The amp does not interleave presets, so the first chunk
// of a new preset also ends an earlier one whose last chunk was lost: everything
// before that chunk is as whole as it will ever get and is handed over at once
// (the reader reports the broken preset as incomplete), rather than the lost chunk
// holding the new preset back too.
//
// The old quiet rule is kept as a fallback for a preset whose end never arrives;
// and because that rule never fires while the tuner streams, a preset that has
// made no progress (no new chunk of it) for maxIncompleteWaitMs is handed over too,
// so the reader can report it as incomplete rather than it blocking the queue. The
// wait counts from the latest chunk, not the first, so a long reply that keeps
// arriving steadily is never cut in two.

/** Where a chunk sits in a multi-chunk message. */
export interface MultiChunkPosition {
    index: number;
    count: number;
}

const TUNER_READING_CMD = 0x03;
const TUNER_READING_SUB_CMD = 0x64;

/**
 * Chunk index and count of a chunk belonging to a multi-chunk message (cmd 0x01 or
 * 0x03, sub 0x01), or null when the chunk is a whole message by itself. A piece of
 * a chunk that lost its start (no leading f0) counts as a whole message: the reader
 * reports it as incomplete, and holding it back would gain nothing.
 */
export function readMultiChunkPosition(chunk: Uint8Array): MultiChunkPosition | null {
    // f0 + 5 header bytes + high-bit byte + count + index, then at least the f7
    if (chunk == null || chunk.length < 10 || chunk[0] != 0xf0) {
        return null;
    }

    const cmd = chunk[4];
    const subCmd = chunk[5];
    if (!((cmd == 0x01 || cmd == 0x03) && subCmd == 0x01)) {
        return null;
    }

    const highBits = chunk[6];
    return {
        count: chunk[7] | ((highBits & 0x01) ? 0x80 : 0),
        index: chunk[8] | ((highBits & 0x02) ? 0x80 : 0)
    };
}

/**
 * How many entries at the start of the queue make up whole messages, i.e. can be
 * handed to SparkMessageReader without cutting a multi-chunk message in two.
 */
export function countCompleteMessages(queue: ReadonlyArray<Uint8Array>): number {
    let complete = 0;
    let multiChunkOpen = false;

    for (let i = 0; i < queue.length; i++) {
        const position = readMultiChunkPosition(queue[i]);

        if (position == null) {
            // a single-chunk message; inside an unfinished preset it has to wait for it
            if (!multiChunkOpen) {
                complete = i + 1;
            }
        } else if (position.index >= position.count - 1) {
            // last chunk (or a bogus index): whatever came before is as whole as it will get
            multiChunkOpen = false;
            complete = i + 1;
        } else {
            if (multiChunkOpen && position.index == 0) {
                // a new message starts while an earlier one is unfinished: that one lost
                // its end and will never be whole, so it no longer holds anything back
                complete = i;
            }
            multiChunkOpen = true;
        }
    }

    return complete;
}

export function isTunerReadingChunk(chunk: Uint8Array): boolean {
    return chunk != null && chunk.length > 5 && chunk[0] == 0xf0
        && chunk[4] == TUNER_READING_CMD && chunk[5] == TUNER_READING_SUB_CMD;
}

export interface SparkReceiveQueueOptions {
    /** Most entries kept; past this the oldest tuner reading (or else the oldest entry) is dropped. */
    maxLength?: number;
    /** How long an unfinished multi-chunk message may hold back the queue without a new chunk of it arriving, while the line stays busy. */
    maxIncompleteWaitMs?: number;
    now?: () => number;
}

export class SparkReceiveQueue {

    public static readonly DEFAULT_MAX_LENGTH = 256;
    public static readonly DEFAULT_MAX_INCOMPLETE_WAIT_MS = 1500;

    private items: Uint8Array[] = [];

    // When the latest chunk of a multi-chunk message was queued. The unfinished part
    // at the end of the queue always starts with such a chunk, so this is when the
    // message still being waited for last made progress.
    private lastMultiChunkAt = 0;

    /** Entries dropped because the queue was full. */
    public droppedCount = 0;

    private readonly maxLength: number;
    private readonly maxIncompleteWaitMs: number;
    private readonly now: () => number;

    constructor(options: SparkReceiveQueueOptions = {}) {
        this.maxLength = options.maxLength ?? SparkReceiveQueue.DEFAULT_MAX_LENGTH;
        this.maxIncompleteWaitMs = options.maxIncompleteWaitMs ?? SparkReceiveQueue.DEFAULT_MAX_INCOMPLETE_WAIT_MS;
        this.now = options.now ?? (() => Date.now());
    }

    get length(): number {
        return this.items.length;
    }

    push(chunk: Uint8Array) {
        this.items.push(chunk);
        if (readMultiChunkPosition(chunk) != null) {
            this.lastMultiChunkAt = this.now();
        }

        while (this.items.length > this.maxLength) {
            // Tuner readings are superseded by the next one anyway, so lose those first.
            const tunerIdx = this.items.findIndex(isTunerReadingChunk);
            this.items.splice(tunerIdx >= 0 ? tunerIdx : 0, 1);
            this.droppedCount++;
        }
    }

    clear() {
        this.items = [];
        this.lastMultiChunkAt = 0;
    }

    /** The last entry, if it ends in an f7 terminator. */
    peekEnd(): Uint8Array | null {
        const lastItem = this.items[this.items.length - 1];
        if (lastItem != null && lastItem[lastItem.length - 1] == 0xf7) {
            return lastItem;
        }
        return null;
    }

    /**
     * Removes and returns the entries that make up whole messages, or null when
     * there are none yet. lineIsQuiet (nothing received for a while) also releases
     * an unfinished multi-chunk message, as the transports always used to.
     */
    take(lineIsQuiet: boolean): Uint8Array[] | null {
        if (this.items.length == 0) {
            return null;
        }

        let count = countCompleteMessages(this.items);

        if (count < this.items.length
            && (lineIsQuiet || (this.now() - this.lastMultiChunkAt) >= this.maxIncompleteWaitMs)) {
            // the message at the end has stalled: hand it over so the reader can report it
            count = this.items.length;
        }

        if (count == 0) {
            return null;
        }

        return this.items.splice(0, count);
    }
}
