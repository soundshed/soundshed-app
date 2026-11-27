/**
 * MIDI input mapping: pure matching, value scaling, rate limiting and dispatch logic.
 *
 * Nothing here talks to WebMidi, React or the amp directly, so it can be unit tested.
 * The app glue lives in midiMappingController.ts.
 */
import {
    EventTargetMapping,
    InputEventMapping,
    MidiEventSource,
    MidiSourceKind,
    MIDI_CHANNEL_ANY,
    ValueCurve,
} from "../spork/src/interfaces/inputEventMapping";

/** A MIDI message reduced to what mappings care about. */
export interface NormalisedMidiEvent {
    kind: MidiSourceKind;
    /** note number, controller number or program number */
    number: number;
    /** 0..127: note velocity (0 for note off), controller value, or 127 for a program change */
    value: number;
    /** MIDI channel 1..16 */
    channel: number;
    /** name of the MIDI input the message arrived on */
    deviceName?: string;
    noteOff?: boolean;
}

export const MIDI_MAX_VALUE = 127;

/** Default write interval for continuous parameter targets (BLE friendly). */
export const DEFAULT_PARAM_WRITE_INTERVAL_MS = 25;

/** Identical repeats of a message inside this window are treated as duplicates. */
export const DEFAULT_DEDUPE_WINDOW_MS = 30;

/** Raw value at which a switch-like control counts as "pressed". */
export const SWITCH_ON_VALUE = 64;

/** A footswitch that only ever sends 127 is treated as pressed again after this gap. */
export const TOGGLE_REPEAT_GAP_MS = 250;

/** fx-onoff threshold mode turns off this many steps below the threshold (avoids flapping). */
export const THRESHOLD_HYSTERESIS = 2;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

const toInt = (v: any): number | null => {
    if (v == null || v === "") return null;
    const n = typeof v === "number" ? v : parseInt(v.toString(), 10);
    return Number.isFinite(n) ? n : null;
};

/**
 * Converts a WebMidi v3 event (or anything shaped like one) into a NormalisedMidiEvent.
 * Returns null for messages mappings don't use (pitch bend, clock, sysex...).
 */
export function normaliseMidiEvent(e: any): NormalisedMidiEvent | null {
    if (e == null) return null;

    const type: string = e.type ?? e.message?.type;
    const channel = toInt(e.message?.channel ?? e.channel) ?? 1;
    const deviceName: string | undefined = e.port?.name ?? e.target?.input?.name ?? e.deviceName;
    const dataBytes: number[] = e.message?.dataBytes ?? [];

    if (type === "noteon" || type === "noteoff") {
        const number = toInt(e.note?.number ?? dataBytes[0]);
        if (number == null) return null;
        const velocity = toInt(e.note?.rawAttack ?? (type === "noteon" ? e.rawValue ?? dataBytes[1] : 0)) ?? 0;
        const noteOff = type === "noteoff" || velocity === 0;
        return { kind: "note", number, value: noteOff ? 0 : clamp(velocity, 1, MIDI_MAX_VALUE), channel, deviceName, noteOff };
    }

    if (type === "controlchange") {
        const number = toInt(e.controller?.number ?? dataBytes[0]);
        // WebMidi v3 reports e.value as a 0..1 float for CC, the 7-bit value is rawValue.
        const value = toInt(e.rawValue ?? dataBytes[1]);
        if (number == null || value == null) return null;
        return { kind: "cc", number, value: clamp(value, 0, MIDI_MAX_VALUE), channel, deviceName };
    }

    if (type === "programchange") {
        const number = toInt(e.rawValue ?? e.value ?? dataBytes[0]);
        if (number == null) return null;
        return { kind: "program", number, value: MIDI_MAX_VALUE, channel, deviceName };
    }

    return null;
}

export const isMidiSource = (source: any): source is MidiEventSource => source?.type === "midi";

const isAnyChannel = (channel: any) => {
    if (channel == null) return true;
    const c = channel.toString().trim().toLowerCase();
    return c === "" || c === MIDI_CHANNEL_ANY || c === "0" || c === "*";
};

const isAnyDevice = (deviceId: any) => {
    if (deviceId == null) return true;
    const d = deviceId.toString().trim().toLowerCase();
    return d === "" || d === MIDI_CHANNEL_ANY || d === "*";
};

/**
 * Whether a mapping source matches an incoming event.
 *
 * - kind "note": note number + channel
 * - kind "cc": controller number + channel (not the controller value)
 * - kind "program": program number + channel
 * - no kind (legacy saved mappings): code matches the note number of a note-on or the
 *   program number of a program change; the channel is ignored, as it always was.
 */
export function matchesSource(source: MidiEventSource | any, ev: NormalisedMidiEvent): boolean {
    if (!isMidiSource(source) || ev == null) return false;

    if (!isAnyDevice(source.deviceId) && source.deviceId !== ev.deviceName) {
        return false;
    }

    const code = toInt(source.code);
    if (code == null) return false;

    if (source.kind == null) {
        if (ev.kind === "note") return !ev.noteOff && code === ev.number;
        if (ev.kind === "program") return code === ev.number;
        return false;
    }

    if (source.kind !== ev.kind) return false;
    if (code !== ev.number) return false;

    if (!isAnyChannel(source.channel) && toInt(source.channel) !== ev.channel) {
        return false;
    }

    return true;
}

/** Shapes a 0..1 position. "log" rises quickly at first, like an audio taper pot. */
export function applyCurve(t: number, curve: ValueCurve | string = "linear"): number {
    const x = clamp(t, 0, 1);
    if (curve === "log") {
        return Math.log10(1 + 9 * x);
    }
    return x;
}

export interface ScaleOptions {
    min?: number;
    max?: number;
    invert?: boolean;
    curve?: ValueCurve | string;
}

/** Scales a raw MIDI value (0..rawMax) into the target's min..max range. */
export function scaleMidiValue(raw: number, opts: ScaleOptions = {}, rawMax: number = MIDI_MAX_VALUE): number {
    const min = opts.min ?? 0;
    const max = opts.max ?? 1;
    let t = rawMax > 0 ? clamp(raw, 0, rawMax) / rawMax : 0;
    if (opts.invert) t = 1 - t;
    t = applyCurve(t, opts.curve);
    const v = min + (max - min) * t;
    // the amp stores params as float32, three decimals is plenty and avoids noise writes
    return Math.round(v * 1000) / 1000;
}

/** Combines a 14-bit CC pair (MSB controller n, LSB controller n+32) into 0..16383. */
export function combine14BitCC(msb: number, lsb: number): number {
    return (clamp(msb, 0, 127) << 7) | clamp(lsb, 0, 127);
}

interface TimerApi {
    setTimeout: (fn: () => void, ms: number) => any;
    clearTimeout: (handle: any) => void;
}

// Resolved at call time so tests using fake timers get the patched globals.
const globalTimers: TimerApi = {
    setTimeout: (fn, ms) => setTimeout(fn, ms),
    clearTimeout: (h) => clearTimeout(h),
};

/**
 * Per-key throttle that sends the first value straight away, then at most one value per
 * interval, always the latest one. The final value is always delivered (trailing edge).
 */
export class KeyedThrottle<T> {
    private state = new Map<string, { timer: any; pending?: { value: T; send: (v: T) => void } }>();

    constructor(private intervalMs: number = DEFAULT_PARAM_WRITE_INTERVAL_MS, private timers: TimerApi = globalTimers) { }

    push(key: string, value: T, send: (v: T) => void) {
        const existing = this.state.get(key);
        if (existing) {
            existing.pending = { value, send };
            return;
        }
        send(value);
        this.state.set(key, { timer: this.startTimer(key) });
    }

    private startTimer(key: string) {
        return this.timers.setTimeout(() => {
            const s = this.state.get(key);
            if (!s) return;
            if (s.pending) {
                const p = s.pending;
                s.pending = undefined;
                p.send(p.value);
                s.timer = this.startTimer(key);
            } else {
                this.state.delete(key);
            }
        }, this.intervalMs);
    }

    /** Sends any pending values now. */
    flush() {
        for (const [key, s] of Array.from(this.state.entries())) {
            this.timers.clearTimeout(s.timer);
            this.state.delete(key);
            if (s.pending) s.pending.send(s.pending.value);
        }
    }

    cancelAll() {
        for (const s of this.state.values()) this.timers.clearTimeout(s.timer);
        this.state.clear();
    }

    get activeKeys(): string[] {
        return Array.from(this.state.keys());
    }
}

/**
 * Drops exact repeats of a message (same input, kind, channel, number and value) that
 * arrive within a short window. Different controllers never suppress each other.
 */
export class MidiEventDeduper {
    private last = new Map<string, { value: number; time: number }>();

    constructor(private windowMs: number = DEFAULT_DEDUPE_WINDOW_MS) { }

    static keyOf(ev: NormalisedMidiEvent) {
        return `${ev.deviceName ?? ""}|${ev.kind}|${ev.channel}|${ev.number}|${ev.noteOff ? "off" : "on"}`;
    }

    isDuplicate(ev: NormalisedMidiEvent, now: number): boolean {
        const key = MidiEventDeduper.keyOf(ev);
        const prev = this.last.get(key);
        this.last.set(key, { value: ev.value, time: now });
        return prev != null && prev.value === ev.value && now - prev.time < this.windowMs;
    }

    reset() {
        this.last.clear();
    }
}

/** What the engine needs from the app to act on mappings. */
export interface MidiMappingSink {
    setAmpChannel(channel: number): void;
    setFxParam(dspId: string, paramIndex: number, value: number): void;
    setFxEnabled(dspId: string, enabled: boolean): void;
    /** Current on/off state of an effect in the live preset, if known. */
    isFxEnabled(dspId: string): boolean | undefined;
}

/**
 * Handler for target types implemented outside this module (e.g. "tuner-toggle",
 * "looper-command"). Receives the mapping and the event that matched it.
 */
export type MidiTargetHandler = (mapping: InputEventMapping, ev: NormalisedMidiEvent) => void;

interface MappingRuntimeState {
    lastValue?: number;
    lastHighTime?: number;
    lastSwitchState?: boolean;
}

export interface MidiMappingEngineOptions {
    throttleMs?: number;
    dedupeWindowMs?: number;
    now?: () => number;
}

export interface HandleEventResult {
    duplicate: boolean;
    matched: InputEventMapping[];
}

export const paramThrottleKey = (dspId: string, paramIndex: number) => `fx-param|${dspId}|${paramIndex}`;

export class MidiMappingEngine {
    private throttle: KeyedThrottle<number>;
    private deduper: MidiEventDeduper;
    private runtime = new Map<string, MappingRuntimeState>();
    private handlers = new Map<string, MidiTargetHandler>();
    private now: () => number;

    constructor(private sink: MidiMappingSink, options: MidiMappingEngineOptions = {}) {
        this.throttle = new KeyedThrottle<number>(options.throttleMs ?? DEFAULT_PARAM_WRITE_INTERVAL_MS);
        this.deduper = new MidiEventDeduper(options.dedupeWindowMs ?? DEFAULT_DEDUPE_WINDOW_MS);
        this.now = options.now ?? (() => Date.now());
    }

    /** Adds support for another target type. Returns a function that removes it again. */
    registerTargetHandler(type: string, handler: MidiTargetHandler): () => void {
        this.handlers.set(type, handler);
        return () => {
            if (this.handlers.get(type) === handler) this.handlers.delete(type);
        };
    }

    handleEvent(ev: NormalisedMidiEvent, mappings: InputEventMapping[]): HandleEventResult {
        if (ev == null) return { duplicate: false, matched: [] };

        if (this.deduper.isDuplicate(ev, this.now())) {
            return { duplicate: true, matched: [] };
        }

        const matched: InputEventMapping[] = [];
        for (const mapping of mappings ?? []) {
            if (!matchesSource(mapping?.source, ev)) continue;
            matched.push(mapping);
            try {
                this.dispatch(mapping, ev);
            } catch (err) {
                console.log("Error trying to map midi event:" + err);
            }
        }
        return { duplicate: false, matched };
    }

    /** Sends any rate limited parameter writes that are still waiting. */
    flush() {
        this.throttle.flush();
    }

    reset() {
        this.throttle.cancelAll();
        this.deduper.reset();
        this.runtime.clear();
    }

    private stateFor(mapping: InputEventMapping): MappingRuntimeState {
        let s = this.runtime.get(mapping.id);
        if (!s) {
            s = {};
            this.runtime.set(mapping.id, s);
        }
        return s;
    }

    private dispatch(mapping: InputEventMapping, ev: NormalisedMidiEvent) {
        const target = mapping.target;
        const state = this.stateFor(mapping);
        const prevValue = state.lastValue;
        state.lastValue = ev.value;

        switch (target?.type) {
            case "amp-channel": {
                if (!isTrigger(ev, prevValue)) return;
                const channel = toInt(target.value);
                if (channel != null) this.sink.setAmpChannel(channel);
                return;
            }
            case "fx-param": {
                if (ev.kind === "note" && ev.noteOff) return;
                if (!target.dspId || target.paramIndex == null) return;
                const value = scaleMidiValue(ev.value, target);
                const dspId = target.dspId;
                const paramIndex = target.paramIndex;
                this.throttle.push(paramThrottleKey(dspId, paramIndex), value, (v) => this.sink.setFxParam(dspId, paramIndex, v));
                return;
            }
            case "fx-onoff": {
                if (!target.dspId) return;
                const desired = this.resolveSwitch(target, ev, state, prevValue);
                if (desired != null) {
                    state.lastSwitchState = desired;
                    this.sink.setFxEnabled(target.dspId, desired);
                }
                return;
            }
            default: {
                const handler = target?.type != null ? this.handlers.get(target.type) : undefined;
                if (handler) handler(mapping, ev);
            }
        }
    }

    private resolveSwitch(target: EventTargetMapping, ev: NormalisedMidiEvent, state: MappingRuntimeState, prevValue: number | undefined): boolean | null {
        const mode = target.mode ?? "toggle";
        const current = this.sink.isFxEnabled(target.dspId);
        // the live preset wins, so switching the effect in the UI isn't undone by stale state
        const known = current ?? state.lastSwitchState;

        const changeTo = (desired: boolean) => (known === desired ? null : desired);

        // notes and program changes are presses in their own right, whatever the velocity
        const pressed = ev.kind === "cc" ? ev.value >= SWITCH_ON_VALUE : !ev.noteOff;

        if (mode === "toggle") {
            const now = this.now();
            if (!pressed) return null;
            const lastHigh = state.lastHighTime;
            state.lastHighTime = now;
            const risingEdge = ev.kind !== "cc" || prevValue == null || prevValue < SWITCH_ON_VALUE;
            const repeatedPress = lastHigh != null && now - lastHigh > TOGGLE_REPEAT_GAP_MS;
            if (!risingEdge && !repeatedPress) return null;
            // prefer the amp's live state, so toggles stay right if the effect was switched elsewhere
            const base = current ?? state.lastSwitchState ?? false;
            return !base;
        }

        if (mode === "momentary" || ev.kind !== "cc") {
            return changeTo(pressed);
        }

        // threshold, with hysteresis so a pedal resting on the threshold doesn't flap
        const threshold = clamp(target.threshold ?? SWITCH_ON_VALUE, 1, MIDI_MAX_VALUE);
        if (ev.value >= threshold) return changeTo(true);
        if (ev.value < threshold - THRESHOLD_HYSTERESIS || ev.value === 0) return changeTo(false);
        return null;
    }
}

/** Whether an event is a "press" for one-shot targets such as amp-channel. */
function isTrigger(ev: NormalisedMidiEvent, prevValue: number | undefined): boolean {
    if (ev.kind === "note") return !ev.noteOff;
    if (ev.kind === "program") return true;
    // cc: fire when crossing upwards through the switch point
    return ev.value >= SWITCH_ON_VALUE && (prevValue == null || prevValue < SWITCH_ON_VALUE);
}

/** Builds a mapping source from a captured event (MIDI learn). */
export function sourceFromEvent(ev: NormalisedMidiEvent, opts: { anyDevice?: boolean; anyChannel?: boolean } = {}): MidiEventSource {
    const source: MidiEventSource = {
        type: "midi",
        kind: ev.kind,
        code: ev.number.toString(),
        channel: opts.anyChannel ? MIDI_CHANNEL_ANY : ev.channel.toString(),
    };
    if (!opts.anyDevice && ev.deviceName) source.deviceId = ev.deviceName;
    return source;
}

/** Whether an event can be learned (note-offs are ignored so a key press isn't captured twice). */
export const isLearnableEvent = (ev: NormalisedMidiEvent | null) => ev != null && !(ev.kind === "note" && ev.noteOff);

const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

/** Note name using the convention of the default mappings (48 = C3). */
export function noteName(n: number): string {
    return NOTE_NAMES[((n % 12) + 12) % 12] + (Math.floor(n / 12) - 1);
}

export function describeSource(source: MidiEventSource | any): string {
    if (!isMidiSource(source)) return source?.code ?? "";
    const code = toInt(source.code);
    if (code == null) return "Not learned";
    let what: string;
    switch (source.kind) {
        case "cc": what = `CC ${code}`; break;
        case "note": what = `Note ${code} (${noteName(code)})`; break;
        case "program": what = `Program ${code}`; break;
        default: what = `Note/Program ${code}`;
    }
    if (source.kind != null) {
        what += isAnyChannel(source.channel) ? " · any ch" : ` · ch ${source.channel}`;
    }
    if (!isAnyDevice(source.deviceId)) what += ` · ${source.deviceId}`;
    return what;
}

export function describeEvent(ev: NormalisedMidiEvent | null): string {
    if (ev == null) return "";
    switch (ev.kind) {
        case "cc": return `CC ${ev.number} = ${ev.value} · ch ${ev.channel}`;
        case "note": return `Note ${ev.number} (${noteName(ev.number)}) ${ev.noteOff ? "off" : "on " + ev.value} · ch ${ev.channel}`;
        case "program": return `Program ${ev.number} · ch ${ev.channel}`;
    }
}

/* ---------- effect lookup helpers (used by the mapping editor and presets) ---------- */

/** The bits of a tone / catalog needed to choose effect targets. */
export interface ToneLike {
    fx?: Array<{ type: string; name?: string; enabled?: boolean; params?: Array<{ paramId: string; name?: string; value?: number }> }>;
}

export interface CatalogLike {
    catalog: Array<{ dspId: string; name: string; type?: string; params: Array<{ index: number; name?: string }> }>;
}

export interface FxTargetOption {
    dspId: string;
    name: string;
    params: Array<{ index: number; name: string }>;
}

/** Effect slots of a tone with display names, for choosing mapping targets. */
export function listFxTargets(tone: ToneLike | null, catalog?: CatalogLike | null): FxTargetOption[] {
    if (!tone?.fx) return [];
    return tone.fx.map((fx) => {
        const def = catalog?.catalog?.find((c) => c.dspId === fx.type);
        const shortId = fx.type?.replace("pg.spark40.", "");
        const params = (fx.params ?? []).map((p) => {
            const index = toInt(p.paramId) ?? 0;
            const name = def?.params?.find((cp) => cp.index === index)?.name ?? p.name ?? `Param ${index + 1}`;
            return { index, name };
        });
        return { dspId: fx.type, name: def?.name ?? fx.name ?? shortId, params };
    });
}

const WAH_PATTERN = /wah/i;
const WAH_POSITION_PARAM_PATTERNS = [/position/i, /pedal/i, /wah/i, /freq/i];

export interface WahTarget {
    dspId: string;
    name: string;
    paramIndex: number;
    paramName: string;
}

/** Finds a wah in the tone and the parameter that acts as its pedal position. */
export function findWahTarget(tone: ToneLike | null, catalog?: CatalogLike | null): WahTarget | null {
    const options = listFxTargets(tone, catalog);
    const wah = options.find((o) => WAH_PATTERN.test(o.name) || WAH_PATTERN.test(o.dspId));
    if (!wah) return null;
    const catalogParams = catalog?.catalog?.find((c) => c.dspId === wah.dspId)?.params?.map((p) => ({ index: p.index, name: p.name ?? "" }));
    const params = wah.params.length > 0 ? wah.params : catalogParams ?? [];
    let param = null;
    for (const pattern of WAH_POSITION_PARAM_PATTERNS) {
        param = params.find((p) => pattern.test(p.name));
        if (param) break;
    }
    param = param ?? params.find((p) => p.index === 0) ?? { index: 0, name: "Param 1" };
    return { dspId: wah.dspId, name: wah.name, paramIndex: param.index, paramName: param.name };
}

/** Standard MIDI controller number for an expression pedal. */
export const EXPRESSION_PEDAL_CC = 11;

/** Raw value above which an expression pedal counts as having left the heel position. */
export const HEEL_THRESHOLD = 3;

/**
 * Mappings for "expression pedal -> wah position": a continuous fx-param mapping and,
 * optionally, an fx-onoff mapping that switches the wah on once the pedal leaves heel.
 */
export function buildExpressionWahMappings(
    wah: WahTarget,
    opts: { autoEnable?: boolean; source?: MidiEventSource; makeId?: () => string } = {}
): InputEventMapping[] {
    const makeId = opts.makeId ?? newMappingId;
    const source: MidiEventSource = opts.source ?? { type: "midi", kind: "cc", code: EXPRESSION_PEDAL_CC.toString(), channel: MIDI_CHANNEL_ANY };
    const mappings: InputEventMapping[] = [
        {
            id: makeId(),
            name: `Expression → ${wah.name} ${wah.paramName}`,
            source: { ...source },
            target: { type: "fx-param", dspId: wah.dspId, paramIndex: wah.paramIndex, min: 0, max: 1, invert: false, curve: "linear" },
        },
    ];
    if (opts.autoEnable) {
        mappings.push({
            id: makeId(),
            name: `Expression → ${wah.name} on when off heel`,
            source: { ...source },
            target: { type: "fx-onoff", dspId: wah.dspId, mode: "threshold", threshold: HEEL_THRESHOLD },
        });
    }
    return mappings;
}

let idCounter = 0;
export function newMappingId(): string {
    idCounter = (idCounter + 1) % 1000;
    return `midi-${Date.now().toString(36)}-${idCounter}`;
}
