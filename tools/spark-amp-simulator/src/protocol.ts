export interface ParsedSparkFrame {
    cmd: number;
    subCmd: number;
    payload7Bit: Uint8Array;
    payload8Bit: Uint8Array;
    rawFrame: Uint8Array;
    rawChunk: Uint8Array;
}

const AMP_TO_APP_DIRECTION = [0x41, 0xff];
const APP_TO_AMP_DIRECTION = [0x53, 0xfe];

export function bytesToHex(data: Uint8Array): string {
    return Buffer.from(data).toString("hex");
}

export function mergeBytes(...chunks: ArrayLike<number>[]): Uint8Array {
    let total = 0;
    for (const chunk of chunks) {
        total += chunk.length;
    }

    const out = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
        out.set(chunk, offset);
        offset += chunk.length;
    }

    return out;
}

export function encode7Bit(data8Bit: Uint8Array): Uint8Array {
    const out: number[] = [];

    for (let seqStart = 0; seqStart < data8Bit.length; seqStart += 7) {
        const seq = data8Bit.subarray(seqStart, Math.min(seqStart + 7, data8Bit.length));
        let bit8 = 0;

        for (let i = 0; i < seq.length; i++) {
            const value = seq[i];
            if ((value & 0x80) === 0x80) {
                bit8 |= (1 << i);
            }
        }

        out.push(bit8);
        for (let i = 0; i < seq.length; i++) {
            out.push(seq[i] & 0x7f);
        }
    }

    return Uint8Array.from(out);
}

export function decode7Bit(data7Bit: Uint8Array): Uint8Array {
    const out: number[] = [];

    for (let seqStart = 0; seqStart < data7Bit.length; seqStart += 8) {
        const seqLen = Math.min(8, data7Bit.length - seqStart);
        if (seqLen <= 0) {
            continue;
        }

        const bit8 = data7Bit[seqStart];
        for (let i = 1; i < seqLen; i++) {
            let value = data7Bit[seqStart + i];
            if ((bit8 & (1 << (i - 1))) !== 0) {
                value |= 0x80;
            }
            out.push(value);
        }
    }

    return Uint8Array.from(out);
}

function stripBlockHeader(frame: Uint8Array): Uint8Array {
    if (frame.length > 16 && frame[0] === 0x01 && frame[1] === 0xfe) {
        return frame.subarray(16);
    }

    return frame;
}

export function parseSparkFrame(frame: Uint8Array): ParsedSparkFrame | null {
    const chunk = stripBlockHeader(frame);

    if (chunk.length < 7) {
        return null;
    }

    if (chunk[0] !== 0xf0) {
        return null;
    }

    const cmd = chunk[4];
    const subCmd = chunk[5];
    const payload7Bit = chunk.subarray(6, chunk.length - 1);
    const payload8Bit = decode7Bit(payload7Bit);

    return {
        cmd,
        subCmd,
        payload7Bit,
        payload8Bit,
        rawFrame: frame,
        rawChunk: chunk
    };
}

function splitPayload8(payload8: Uint8Array): Uint8Array[] {
    const chunks: Uint8Array[] = [];
    const chunkSize = 0x80;
    const numChunks = Math.max(1, Math.ceil(payload8.length / chunkSize));

    for (let i = 0; i < numChunks; i++) {
        const start = i * chunkSize;
        const len = Math.min(chunkSize, payload8.length - start);
        let chunkData = payload8.subarray(start, start + len);

        if (numChunks > 1) {
            const header = Uint8Array.from([numChunks, i, len]);
            chunkData = mergeBytes(header, chunkData);
        }

        chunks.push(chunkData);
    }

    return chunks;
}

function wrapBlock(chunkPayload7Bit: Uint8Array, cmd: number, subCmd: number, fromAmp: boolean): Uint8Array {
    const direction = fromAmp ? AMP_TO_APP_DIRECTION : APP_TO_AMP_DIRECTION;

    const blockHeader = Uint8Array.from([0x01, 0xfe, 0x00, 0x00, direction[0], direction[1]]);
    const filler = Uint8Array.from([0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
    const chunkHeader = Uint8Array.from([0xf0, 0x01, 0x3a, 0x15]);
    const trailer = Uint8Array.from([0xf7]);

    const blockSize = chunkPayload7Bit.length + 16 + 6 + 1;

    return mergeBytes(
        blockHeader,
        Uint8Array.from([blockSize]),
        filler,
        chunkHeader,
        Uint8Array.from([cmd, subCmd]),
        chunkPayload7Bit,
        trailer
    );
}

export function buildSparkFrames(cmd: number, subCmd: number, payload8Bit: Uint8Array, fromAmp = true): Uint8Array[] {
    const data8Chunks = splitPayload8(payload8Bit);

    return data8Chunks.map((data8) => {
        const payload7 = encode7Bit(data8);
        return wrapBlock(payload7, cmd, subCmd, fromAmp);
    });
}
