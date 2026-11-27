import { SparkModelProfile } from "./models";
import { buildSparkFrames, ParsedSparkFrame } from "./protocol";
import { createDefaultPresetPayload, encodeMsgpackString } from "./presetFactory";

interface PendingUpload {
    expectedChunks: number;
    chunks: Map<number, Uint8Array>;
}

export interface SparkAmpSimulatorStateSnapshot {
    selectedSlot: number;
    storedPresets: number;
    pendingUpload: string;
    uploadCompleted: boolean;
    lastCmd: number | null;
    lastSubCmd: number | null;
    lastResponses: number;
    serial: string;
    currentPreset: SparkAmpPresetSummary;
    tunerEnabled: boolean;
}

export interface SparkAmpPresetSummary {
    slot: number;
    uuid: string;
    name: string;
    bpm: number;
    fxCount: number;
    activeFxCount: number;
    fxNames: string[];
    chainSlots: SparkAmpChainSlotSummary[];
}

export interface SparkAmpChainSlotSummary {
    index: number;
    dspId: string;
    active: boolean;
    paramValues: number[];
}

/** Mixer channel volumes (0x01 0x33) the simulator starts with: guitar, music, master. */
export const SIM_DEFAULT_MIXER_VOLUMES: ReadonlyArray<[number, number]> = [
    [0, 0.5],
    [5, 0.5],
    [9, 0.7]
];

export interface SparkAmpSimulatorOptions {
    logger?: (msg: string) => void;
    /**
     * How often a tuner reading (0x03 0x64) is sent while the tuner is on. The real amp
     * sends one about every 60 ms (TominoCZ/Flint, TunerReading), which is shorter than
     * the quiet period the app's transports used to wait for before reading anything.
     */
    tunerIntervalMs?: number;
}

/** Default interval between tuner readings, like the real amp. */
export const SIM_TUNER_INTERVAL_MS = 60;

/** Offset the amp sends with note 0 while nothing is played. */
export const SIM_TUNER_NO_SIGNAL_OFFSET = -1.0;

interface SparkEditableEffect {
    dspId: string;
    active: boolean;
    params: number[];
}

interface SparkEditablePreset {
    slot: number;
    uuid: string;
    name: string;
    version: string;
    description: string;
    icon: string;
    bpm: number;
    effects: SparkEditableEffect[];
}

export class SparkAmpSimulator {
    private selectedSlot = 0;
    private presetBank: Map<number, Uint8Array> = new Map();
    private pendingUpload: PendingUpload | null = null;
    private uploadCompleted = false;
    private readonly serial: string;
    private lastCmd: number | null = null;
    private lastSubCmd: number | null = null;
    private lastResponses = 0;
    private readonly textDecoder = new TextDecoder();
    private readonly textEncoder = new TextEncoder();
    // Tuner (0x01 0x65 / 0x02 0x65): while on, readings are pushed to the transports
    // without being asked for, through the unsolicited listeners.
    private tunerEnabled = false;
    private tunerTimer: ReturnType<typeof setInterval> | null = null;
    private tunerReadingCount = 0;
    private unsolicitedListeners: Set<(frames: Uint8Array[]) => void> = new Set();
    // Experimental mixer (0x01 0x33 / 0x02 0x33), see src/spork/src/interfaces/mixer.ts.
    private mixerVolumes: Map<number, number> = new Map(SIM_DEFAULT_MIXER_VOLUMES);

    constructor(private profile: SparkModelProfile, private options: SparkAmpSimulatorOptions = {}) {
        this.serial = `${profile.id.replace(/[^a-z0-9]/gi, "").toUpperCase()}-SIM-0001`;

        for (let i = 0; i < profile.presetSlots; i++) {
            this.presetBank.set(i, createDefaultPresetPayload(profile, i));
        }
    }

    private log(msg: string) {
        this.options.logger?.(`[sim:${this.profile.id}] ${msg}`);
    }

    private readPackedString(payload: Uint8Array, idx: number): { value: string; next: number } | null {
        if (idx >= payload.length) {
            return null;
        }

        const prefix = payload[idx];
        if (prefix === 0xd9) {
            if (idx + 1 >= payload.length) {
                return null;
            }

            const len = payload[idx + 1];
            const start = idx + 2;
            const end = start + len;
            if (end > payload.length) {
                return null;
            }

            return {
                value: this.textDecoder.decode(payload.subarray(start, end)),
                next: end
            };
        }

        if (prefix >= 0xa0 && prefix <= 0xbf) {
            const len = prefix - 0xa0;
            const start = idx + 1;
            const end = start + len;
            if (end > payload.length) {
                return null;
            }

            return {
                value: this.textDecoder.decode(payload.subarray(start, end)),
                next: end
            };
        }

        return null;
    }

    private readFloat(payload: Uint8Array, idx: number): { value: number; next: number } | null {
        if (idx + 5 > payload.length || payload[idx] !== 0xca) {
            return null;
        }

        const view = new DataView(payload.buffer, payload.byteOffset + idx + 1, 4);
        const value = view.getFloat32(0, false);
        return { value, next: idx + 5 };
    }

    private summarizePresetPayload(payload: Uint8Array): SparkAmpPresetSummary {
        let idx = 0;

        const presetType = payload[idx] ?? 0;
        idx += 1;

        const slot = payload[idx] ?? this.selectedSlot;
        idx += 1;

        if (presetType !== 0) {
            return {
                slot,
                uuid: "",
                name: "(unknown)",
                bpm: 0,
                fxCount: 0,
                activeFxCount: 0,
                fxNames: [],
                chainSlots: []
            };
        }

        const uuid = this.readPackedString(payload, idx);
        if (!uuid) {
            return {
                slot,
                uuid: "",
                name: "(decode failed)",
                bpm: 0,
                fxCount: 0,
                activeFxCount: 0,
                fxNames: [],
                chainSlots: []
            };
        }
        idx = uuid.next;

        const name = this.readPackedString(payload, idx);
        if (!name) {
            return {
                slot,
                uuid: uuid.value,
                name: "(decode failed)",
                bpm: 0,
                fxCount: 0,
                activeFxCount: 0,
                fxNames: [],
                chainSlots: []
            };
        }
        idx = name.next;

        const version = this.readPackedString(payload, idx);
        if (version) {
            idx = version.next;
        }

        const description = this.readPackedString(payload, idx);
        if (description) {
            idx = description.next;
        }

        const icon = this.readPackedString(payload, idx);
        if (icon) {
            idx = icon.next;
        }

        const bpmParsed = this.readFloat(payload, idx);
        const bpm = bpmParsed ? bpmParsed.value : 0;
        if (bpmParsed) {
            idx = bpmParsed.next;
        }

        let fxCount = 0;
        let activeFxCount = 0;
        const fxNames: string[] = [];
        const chainSlots: SparkAmpChainSlotSummary[] = [];

        if (idx < payload.length && payload[idx] >= 0x90 && payload[idx] <= 0x9f) {
            fxCount = payload[idx] - 0x90;
            idx += 1;

            for (let i = 0; i < fxCount; i++) {
                const fxName = this.readPackedString(payload, idx);
                if (!fxName) {
                    break;
                }
                idx = fxName.next;
                fxNames.push(fxName.value);

                const onOff = payload[idx];
                idx += 1;
                if (onOff === 0xc3) {
                    activeFxCount += 1;
                }
                const active = onOff === 0xc3;

                const paramsPrefix = payload[idx] ?? 0x90;
                idx += 1;
                const numParams = Math.max(0, paramsPrefix - 0x90);
                const paramValues: number[] = [];

                for (let p = 0; p < numParams; p++) {
                    idx += 1; // param index
                    idx += 1; // spec (usually 0x91)
                    const parsedFloat = this.readFloat(payload, idx);
                    if (parsedFloat) {
                        paramValues.push(parsedFloat.value);
                        idx = parsedFloat.next;
                    } else {
                        break;
                    }
                }

                chainSlots.push({
                    index: i,
                    dspId: fxName.value,
                    active,
                    paramValues
                });
            }
        }

        return {
            slot,
            uuid: uuid.value,
            name: name.value,
            bpm,
            fxCount,
            activeFxCount,
            fxNames,
            chainSlots
        };
    }

    private appendPackedString(out: number[], value: string) {
        const encoded = Array.from(this.textEncoder.encode(value));

        if (encoded.length > 31) {
            out.push(0xd9, encoded.length, ...encoded);
            return;
        }

        out.push(0xa0 + encoded.length, ...encoded);
    }

    private appendFloat(out: number[], value: number) {
        const floatArray = new Float32Array(1);
        floatArray[0] = value;
        const bytes = Array.from(new Uint8Array(floatArray.buffer).reverse());
        out.push(0xca, ...bytes);
    }

    private checksum(data: number[]): number {
        let total = 0;
        for (const b of data) {
            total += b > 127 ? 0xcc : b;
        }
        return total % 256;
    }

    private decodeEditablePreset(payload: Uint8Array): SparkEditablePreset | null {
        if (payload.length < 2 || payload[0] !== 0x00) {
            return null;
        }

        let idx = 1;
        const slot = payload[idx] ?? this.selectedSlot;
        idx += 1;

        const uuid = this.readPackedString(payload, idx);
        if (!uuid) {
            return null;
        }
        idx = uuid.next;

        const name = this.readPackedString(payload, idx);
        if (!name) {
            return null;
        }
        idx = name.next;

        const version = this.readPackedString(payload, idx);
        if (!version) {
            return null;
        }
        idx = version.next;

        const description = this.readPackedString(payload, idx);
        if (!description) {
            return null;
        }
        idx = description.next;

        const icon = this.readPackedString(payload, idx);
        if (!icon) {
            return null;
        }
        idx = icon.next;

        const bpmParsed = this.readFloat(payload, idx);
        if (!bpmParsed) {
            return null;
        }
        idx = bpmParsed.next;

        if (idx >= payload.length) {
            return null;
        }

        const fxPrefix = payload[idx];
        if (fxPrefix < 0x90 || fxPrefix > 0x9f) {
            return null;
        }
        const fxCount = fxPrefix - 0x90;
        idx += 1;

        const effects: SparkEditableEffect[] = [];

        for (let i = 0; i < fxCount; i++) {
            const fxName = this.readPackedString(payload, idx);
            if (!fxName) {
                break;
            }
            idx = fxName.next;

            const onOff = payload[idx];
            idx += 1;

            const paramPrefix = payload[idx] ?? 0x90;
            idx += 1;
            const numParams = Math.max(0, paramPrefix - 0x90);
            const params: number[] = [];

            for (let p = 0; p < numParams; p++) {
                const paramIndex = payload[idx] ?? p;
                idx += 1;

                idx += 1; // spec byte

                const parsedFloat = this.readFloat(payload, idx);
                if (!parsedFloat) {
                    break;
                }
                idx = parsedFloat.next;
                params[paramIndex] = parsedFloat.value;
            }

            effects.push({
                dspId: fxName.value,
                active: onOff === 0xc3,
                params: params.map((v) => (v == null ? 0 : v))
            });
        }

        return {
            slot,
            uuid: uuid.value,
            name: name.value,
            version: version.value,
            description: description.value,
            icon: icon.value,
            bpm: bpmParsed.value,
            effects
        };
    }

    private encodeEditablePreset(preset: SparkEditablePreset): Uint8Array {
        const payload: number[] = [];

        payload.push(0x00, this.normalizeSlot(preset.slot));
        this.appendPackedString(payload, preset.uuid);
        this.appendPackedString(payload, preset.name);
        this.appendPackedString(payload, preset.version || "0.7");
        this.appendPackedString(payload, preset.description || "");
        this.appendPackedString(payload, preset.icon || "icon.png");
        this.appendFloat(payload, preset.bpm || 120.0);

        payload.push(0x90 + preset.effects.length);

        for (const effect of preset.effects) {
            this.appendPackedString(payload, effect.dspId);
            payload.push(effect.active ? 0xc3 : 0xc2);

            const params = effect.params ?? [];
            payload.push(0x90 + params.length);
            for (let i = 0; i < params.length; i++) {
                payload.push(i);
                payload.push(0x91);
                this.appendFloat(payload, params[i]);
            }
        }

        payload.push(this.checksum(payload.slice(2)));
        return Uint8Array.from(payload);
    }

    private readPrefixedSparkString(data8: Uint8Array, idx: number): { value: string; next: number } | null {
        if (idx + 1 >= data8.length) {
            return null;
        }

        const parsed = this.readPackedString(data8, idx + 1);
        if (!parsed) {
            return null;
        }

        return {
            value: parsed.value,
            next: parsed.next
        };
    }

    private getCurrentEditablePreset(): SparkEditablePreset | null {
        const payload = this.getPresetPayload(this.selectedSlot);
        return this.decodeEditablePreset(payload);
    }

    private writeCurrentEditablePreset(preset: SparkEditablePreset) {
        const targetSlot = this.normalizeSlot(this.selectedSlot);
        const encoded = this.encodeEditablePreset({ ...preset, slot: targetSlot });
        this.presetBank.set(targetSlot, encoded);
    }

    private mutateCurrentPreset(mutator: (preset: SparkEditablePreset) => void): boolean {
        const preset = this.getCurrentEditablePreset();
        if (!preset) {
            return false;
        }

        mutator(preset);
        this.writeCurrentEditablePreset(preset);
        return true;
    }

    private updateEffectParameter(dspId: string, paramIndex: number, value: number): boolean {
        return this.mutateCurrentPreset((preset) => {
            const effect = preset.effects.find((fx) => fx.dspId === dspId);
            if (!effect) {
                return;
            }

            while (effect.params.length <= paramIndex) {
                effect.params.push(0);
            }
            effect.params[paramIndex] = value;
        });
    }

    private toggleEffect(dspId: string, active: boolean): boolean {
        return this.mutateCurrentPreset((preset) => {
            const effect = preset.effects.find((fx) => fx.dspId === dspId);
            if (!effect) {
                return;
            }
            effect.active = active;
        });
    }

    private swapEffect(oldDspId: string, newDspId: string): boolean {
        return this.mutateCurrentPreset((preset) => {
            const effect = preset.effects.find((fx) => fx.dspId === oldDspId);
            if (!effect) {
                return;
            }
            effect.dspId = newDspId;
        });
    }

    private formatByte(value: number): string {
        return value.toString(16).padStart(2, "0");
    }

    private buildStateSummary(lastCmd: number, lastSubCmd: number, responses: Uint8Array[]): string {
        const pendingUpload = this.pendingUpload
            ? `${this.pendingUpload.chunks.size}/${this.pendingUpload.expectedChunks}`
            : "none";

        return [
            `cmd=0x${this.formatByte(lastCmd)}`,
            `sub=0x${this.formatByte(lastSubCmd)}`,
            `selectedSlot=${this.selectedSlot}`,
            `storedPresets=${this.presetBank.size}`,
            `pendingUpload=${pendingUpload}`,
            `uploadCompleted=${this.uploadCompleted}`,
            `responses=${responses.length}`
        ].join(" ");
    }

    /**
     * Subscribes to frames the amp sends on its own (tuner readings). Returns a function
     * that unsubscribes.
     */
    public onUnsolicited(listener: (frames: Uint8Array[]) => void): () => void {
        this.unsolicitedListeners.add(listener);
        return () => {
            this.unsolicitedListeners.delete(listener);
        };
    }

    public isTunerEnabled(): boolean {
        return this.tunerEnabled;
    }

    /** Switches the tuner, as the app's 0x01 0x65 or the amp's own button would. */
    public setTunerEnabled(enabled: boolean) {
        if (enabled === this.tunerEnabled) {
            return;
        }

        this.tunerEnabled = enabled;
        this.log(`Tuner switched ${enabled ? "on" : "off"}`);

        if (this.tunerTimer) {
            clearInterval(this.tunerTimer);
            this.tunerTimer = null;
        }

        if (enabled) {
            this.tunerReadingCount = 0;
            this.tunerTimer = setInterval(() => this.emitTunerReading(), this.options.tunerIntervalMs ?? SIM_TUNER_INTERVAL_MS);
            // never keep a process alive just for the tuner
            this.tunerTimer.unref?.();
        }
    }

    /** Stops anything running in the background (the tuner stream). */
    public dispose() {
        this.setTunerEnabled(false);
        this.unsolicitedListeners.clear();
    }

    // A string being tuned up to A and back, with a short silence (note 0, -1.0)
    // now and then, like the readings in Flint's tuner capture.
    private nextTunerReading(): { note: number; offset: number } {
        const step = this.tunerReadingCount++ % 20;
        if (step >= 17) {
            return { note: 0, offset: SIM_TUNER_NO_SIGNAL_OFFSET };
        }
        return { note: 9, offset: 0.3 + (step / 16) * 0.4 };
    }

    private emitTunerReading() {
        if (!this.tunerEnabled) {
            return;
        }

        const reading = this.nextTunerReading();
        const payload: number[] = [reading.note];
        this.appendFloat(payload, reading.offset);
        const frames = buildSparkFrames(0x03, 0x64, Uint8Array.from(payload));

        for (const listener of this.unsolicitedListeners) {
            listener(frames);
        }
    }

    /** Current volume of a mixer channel (0..1), or undefined if it was never set. */
    public getMixerVolume(channel: number): number | undefined {
        return this.mixerVolumes.get(channel);
    }

    private floatPayload(value: number): Uint8Array {
        const out: number[] = [];
        this.appendFloat(out, value);
        return Uint8Array.from(out);
    }

    // 0x01 0x33: channel byte + float (+ an optional trailing 0x00, Spark 2 style).
    // Acked with 0x04 0x33; a guitar (channel 0) change is also reported as 0x03 0x6b,
    // the way the amp reports its input volume.
    private handleMixerSet(data8: Uint8Array): Uint8Array[] {
        const ack = buildSparkFrames(0x04, 0x33, new Uint8Array());
        if (data8.length < 6 || data8[0] > 0x7f) {
            this.log("Mixer set too short or bad channel, acking without change");
            return ack;
        }

        const channel = data8[0];
        const parsed = this.readFloat(data8, 1);
        if (!parsed || !Number.isFinite(parsed.value)) {
            return ack;
        }

        const value = Math.min(1, Math.max(0, parsed.value));
        const previous = this.mixerVolumes.get(channel);
        this.mixerVolumes.set(channel, value);
        this.log(`Mixer channel ${channel} set to ${value.toFixed(3)}${data8.length > 6 ? " (with trailing byte)" : ""}`);

        if (channel === 0 && previous !== value) {
            return [...ack, ...buildSparkFrames(0x03, 0x6b, this.floatPayload(value))];
        }
        return ack;
    }

    public getStateSnapshot(): SparkAmpSimulatorStateSnapshot {
        const pendingUpload = this.pendingUpload
            ? `${this.pendingUpload.chunks.size}/${this.pendingUpload.expectedChunks}`
            : "none";

        const currentPresetPayload = this.getPresetPayload(this.selectedSlot);
        const currentPreset = this.summarizePresetPayload(currentPresetPayload);

        return {
            selectedSlot: this.selectedSlot,
            storedPresets: this.presetBank.size,
            pendingUpload,
            uploadCompleted: this.uploadCompleted,
            lastCmd: this.lastCmd,
            lastSubCmd: this.lastSubCmd,
            lastResponses: this.lastResponses,
            serial: this.serial,
            currentPreset,
            tunerEnabled: this.tunerEnabled
        };
    }

    private normalizeSlot(raw: number): number {
        if (raw === 0x7f) {
            return this.selectedSlot;
        }

        if (!Number.isFinite(raw) || raw < 0) {
            return this.selectedSlot;
        }

        return raw % this.profile.presetSlots;
    }

    private getPresetPayload(slot: number): Uint8Array {
        const normalized = this.normalizeSlot(slot);
        return this.presetBank.get(normalized) ?? createDefaultPresetPayload(this.profile, normalized);
    }

    private commitPresetUpload(payload: Uint8Array) {
        if (payload.length < 2) {
            return;
        }

        const slotByte = payload[1];
        const targetSlot = this.normalizeSlot(slotByte);

        this.presetBank.set(targetSlot, payload);
        this.log(`Stored uploaded preset into slot ${targetSlot}`);
    }

    private handlePresetUpload(data8: Uint8Array): Uint8Array[] {
        if (data8.length === 0) {
            return [];
        }

        const looksMultipart = data8.length >= 3 && data8[0] > 1 && data8[1] < data8[0];

        let isFinal = true;
        let payloadToStore: Uint8Array | null = null;

        if (looksMultipart) {
            const expectedChunks = data8[0];
            const index = data8[1];
            const chunkLen = data8[2];
            const chunkPayload = data8.subarray(3, 3 + chunkLen);

            if (!this.pendingUpload || this.pendingUpload.expectedChunks !== expectedChunks) {
                this.pendingUpload = {
                    expectedChunks,
                    chunks: new Map()
                };
            }

            this.pendingUpload.chunks.set(index, chunkPayload);
            isFinal = index === expectedChunks - 1;

            if (isFinal) {
                const assembled: Uint8Array[] = [];
                let complete = true;

                for (let i = 0; i < expectedChunks; i++) {
                    const part = this.pendingUpload.chunks.get(i);
                    if (!part) {
                        complete = false;
                        break;
                    }
                    assembled.push(part);
                }

                if (complete) {
                    let total = 0;
                    for (const part of assembled) {
                        total += part.length;
                    }

                    const merged = new Uint8Array(total);
                    let offset = 0;
                    for (const part of assembled) {
                        merged.set(part, offset);
                        offset += part.length;
                    }

                    payloadToStore = merged;
                }

                this.pendingUpload = null;
            }
        } else {
            payloadToStore = data8;
            this.pendingUpload = null;
        }

        if (payloadToStore) {
            this.commitPresetUpload(payloadToStore);
            this.uploadCompleted = true;
        }

        const ackCmd = isFinal ? this.profile.uploadFinalAckCmd : this.profile.uploadChunkAckCmd;
        return buildSparkFrames(ackCmd, 0x01, new Uint8Array());
    }

    private handleGet(subCmd: number, data8: Uint8Array): Uint8Array[] {
        switch (subCmd) {
            case 0x01: {
                const requestedSlot = data8.length > 1 ? data8[1] : (data8[0] ?? this.selectedSlot);
                const payload = this.getPresetPayload(requestedSlot);
                return buildSparkFrames(0x03, 0x01, payload);
            }
            case 0x10: {
                return buildSparkFrames(0x03, 0x10, Uint8Array.from([0x00, this.selectedSlot]));
            }
            case 0x11: {
                return buildSparkFrames(0x03, 0x11, encodeMsgpackString(this.profile.bleName));
            }
            case 0x23: {
                return buildSparkFrames(0x03, 0x23, encodeMsgpackString(this.serial));
            }
            case 0x65: {
                return buildSparkFrames(0x03, 0x65, Uint8Array.from([this.tunerEnabled ? 0xc3 : 0xc2]));
            }
            case 0x33: {
                // the reply carries only the value, as documented for the Spark LIVE
                const channel = data8.length > 0 ? data8[0] : 0;
                const value = this.mixerVolumes.get(channel);
                if (value == null) {
                    // unknown channel: stay silent, like an amp that does not have it
                    return [];
                }
                return buildSparkFrames(0x03, 0x33, this.floatPayload(value));
            }
            case 0x1a: {
                if (!this.profile.supportsLiveSync) {
                    return [];
                }

                const out: Uint8Array[] = [];
                if (this.uploadCompleted) {
                    out.push(...buildSparkFrames(0x03, 0x62, new Uint8Array()));
                }

                out.push(...buildSparkFrames(0x03, 0x1a, Uint8Array.from([0x01, 0x12, 0x00, 0x01])));
                this.uploadCompleted = false;
                return out;
            }
            default:
                return [];
        }
    }

    private handleCmd01(subCmd: number, data8: Uint8Array): Uint8Array[] {
        switch (subCmd) {
            case 0x01:
                return this.handlePresetUpload(data8);
            case 0x04: {
                const effect = this.readPrefixedSparkString(data8, 0);
                if (!effect || effect.next >= data8.length) {
                    return [];
                }

                const paramIndex = data8[effect.next] ?? 0;
                const valueParsed = this.readFloat(data8, effect.next + 1);
                if (!valueParsed) {
                    return [];
                }

                this.updateEffectParameter(effect.value, paramIndex, valueParsed.value);
                return [];
            }
            case 0x06:
                {
                    const oldFx = this.readPrefixedSparkString(data8, 0);
                    if (!oldFx) {
                        return buildSparkFrames(0x04, subCmd, new Uint8Array());
                    }
                    const newFx = this.readPrefixedSparkString(data8, oldFx.next);
                    if (newFx) {
                        this.swapEffect(oldFx.value, newFx.value);
                    }
                }
                return buildSparkFrames(0x04, subCmd, new Uint8Array());
            case 0x15:
                {
                    const effect = this.readPrefixedSparkString(data8, 0);
                    if (!effect || effect.next >= data8.length) {
                        return buildSparkFrames(0x04, subCmd, new Uint8Array());
                    }
                    const onOff = data8[effect.next] === 0xc3;
                    this.toggleEffect(effect.value, onOff);
                }
                return buildSparkFrames(0x04, subCmd, new Uint8Array());
            case 0x65: {
                // msgpack bool; acked with 0x04 0x65 like the real amp (Flint's tuner capture)
                if (data8.length > 0 && (data8[0] === 0xc3 || data8[0] === 0xc2)) {
                    this.setTunerEnabled(data8[0] === 0xc3);
                }
                return buildSparkFrames(0x04, 0x65, new Uint8Array());
            }
            case 0x33:
                return this.handleMixerSet(data8);
            case 0x38: {
                if (data8.length > 1) {
                    this.selectedSlot = this.normalizeSlot(data8[1]);
                    this.log(`Selected slot set to ${this.selectedSlot}`);
                }
                return buildSparkFrames(0x04, 0x38, new Uint8Array());
            }
            default:
                return buildSparkFrames(0x04, subCmd, new Uint8Array());
        }
    }

    private handleCmd03(subCmd: number, data8: Uint8Array): Uint8Array[] {
        switch (subCmd) {
            case 0x37:
                {
                    const effect = this.readPrefixedSparkString(data8, 0);
                    if (effect && effect.next < data8.length) {
                        const paramIndex = data8[effect.next] ?? 0;
                        const valueParsed = this.readFloat(data8, effect.next + 1);
                        if (valueParsed) {
                            this.updateEffectParameter(effect.value, paramIndex, valueParsed.value);
                        }
                    }
                }
                return [];
            case 0x27: {
                const slot = data8.length > 1 ? this.normalizeSlot(data8[1]) : this.selectedSlot;
                this.presetBank.set(slot, this.getPresetPayload(this.selectedSlot));
                this.log(`Stored selected slot ${this.selectedSlot} into slot ${slot}`);
                return buildSparkFrames(0x03, 0x27, Uint8Array.from([0x00, slot]));
            }
            case 0x06:
                {
                    const oldFx = this.readPrefixedSparkString(data8, 0);
                    if (oldFx) {
                        const newFx = this.readPrefixedSparkString(data8, oldFx.next);
                        if (newFx) {
                            this.swapEffect(oldFx.value, newFx.value);
                        }
                    }
                }
                return buildSparkFrames(0x04, 0x06, new Uint8Array());
            default:
                return [];
        }
    }

    public handleMessage(parsed: ParsedSparkFrame): Uint8Array[] {
        let responses: Uint8Array[] = [];

        this.lastCmd = parsed.cmd;
        this.lastSubCmd = parsed.subCmd;

        if (parsed.cmd === 0x02) {
            responses = this.handleGet(parsed.subCmd, parsed.payload8Bit);
            this.lastResponses = responses.length;
            this.log(this.buildStateSummary(parsed.cmd, parsed.subCmd, responses));
            return responses;
        }

        if (parsed.cmd === 0x01) {
            responses = this.handleCmd01(parsed.subCmd, parsed.payload8Bit);
            this.lastResponses = responses.length;
            this.log(this.buildStateSummary(parsed.cmd, parsed.subCmd, responses));
            return responses;
        }

        if (parsed.cmd === 0x03) {
            responses = this.handleCmd03(parsed.subCmd, parsed.payload8Bit);
            this.lastResponses = responses.length;
            this.log(this.buildStateSummary(parsed.cmd, parsed.subCmd, responses));
            return responses;
        }

        this.lastResponses = responses.length;
        this.log(this.buildStateSummary(parsed.cmd, parsed.subCmd, responses));
        return responses;
    }
}
