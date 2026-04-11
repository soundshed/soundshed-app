import { SparkModelProfile } from "./models";

const encoder = new TextEncoder();

interface SimFxSpec {
    dspId: string;
    active: boolean;
    params: number[];
}

const DEFAULT_FX_CHAIN: SimFxSpec[] = [
    { dspId: "bias.noisegate", active: true, params: [0.12, 0.23, 0.0] },
    { dspId: "Compressor", active: false, params: [0.4, 0.5] },
    { dspId: "Booster", active: false, params: [0.6] },
    { dspId: "Twin", active: true, params: [0.55, 0.43, 0.37, 0.52, 0.71] },
    { dspId: "ChorusAnalog", active: false, params: [0.2, 0.35, 0.4, 0.42] },
    { dspId: "DelayMono", active: true, params: [0.2, 0.22, 0.48, 0.45, 1.0] },
    { dspId: "bias.reverb", active: true, params: [0.3, 0.5, 0.4, 0.34, 0.6, 0.65, 0.2] }
];

function appendString(out: number[], value: string) {
    const encoded = Array.from(encoder.encode(value));

    if (encoded.length > 31) {
        out.push(0xd9, encoded.length, ...encoded);
        return;
    }

    out.push(0xa0 + encoded.length, ...encoded);
}

function appendFloat(out: number[], value: number) {
    const floatArray = new Float32Array(1);
    floatArray[0] = value;
    const bytes = Array.from(new Uint8Array(floatArray.buffer).reverse());
    out.push(0xca, ...bytes);
}

function appendBool(out: number[], value: boolean) {
    out.push(value ? 0xc3 : 0xc2);
}

function checksum(data: number[]): number {
    let total = 0;

    for (const b of data) {
        total += b > 127 ? 0xcc : b;
    }

    return total % 256;
}

function createUuid(modelId: string, slot: number): string {
    const modelTag = modelId.replace(/[^a-z0-9]/gi, "").toUpperCase();
    return `${modelTag}-SIM-${slot.toString(16).padStart(2, "0")}-0000`;
}

export function createDefaultPresetPayload(profile: SparkModelProfile, slot: number): Uint8Array {
    const payload: number[] = [];

    payload.push(0x00, slot);

    const uuid = createUuid(profile.id, slot);
    const name = `${profile.displayName} Sim ${slot + 1}`;

    appendString(payload, uuid);
    appendString(payload, name);
    appendString(payload, "0.7");
    appendString(payload, `Simulated preset ${slot + 1}`);
    appendString(payload, "icon.png");
    appendFloat(payload, 120.0);

    payload.push(0x90 + DEFAULT_FX_CHAIN.length);

    for (const fx of DEFAULT_FX_CHAIN) {
        appendString(payload, fx.dspId);
        appendBool(payload, fx.active);
        payload.push(0x90 + fx.params.length);

        for (let i = 0; i < fx.params.length; i++) {
            payload.push(i);
            payload.push(0x91);
            appendFloat(payload, fx.params[i]);
        }
    }

    payload.push(checksum(payload.slice(2)));

    return Uint8Array.from(payload);
}

export function encodeMsgpackString(value: string): Uint8Array {
    const out: number[] = [];
    appendString(out, value);
    return Uint8Array.from(out);
}
