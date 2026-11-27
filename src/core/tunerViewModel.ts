import { DeviceMessage } from "../spork/src/interfaces/preset";
import { TUNER_MESSAGE_ONOFF, TUNER_MESSAGE_OUTPUT, TunerOnOffMessage, TunerOutputMessage } from "../spork/src/interfaces/tuner";
import { TunerStateStore, initialTunerState } from "../stores/tunerstate";
import { DeviceStateStore } from "../stores/devicestate";
import { platformEvents } from "./platformUtils";

// ---------------------------------------------------------------------------
// Interpreting the amp's tuner readings
//
// ASSUMPTIONS (not confirmed on hardware, taken from Ignitron's SparkStatus):
//
//  * Note numbering: the note byte is a pitch class with C = 0 ... B = 11,
//    taken modulo 12 (SparkStatus::noteString uses notes[note % 12]). The value
//    0x0e is special-cased by Ignitron as "no note" (nothing being played) and
//    is shown as such here. Octave information is not sent / not known.
//
//  * Offset scale: the float runs 0.0 .. 1.0 across one semitone window centred
//    on the note, with 0.5 meaning exactly in tune. Ignitron converts it with
//    cents = offset * 100 - 50, i.e. 0.0 = 50 cents flat, 1.0 = 50 cents sharp.
//
//  * In tune: within +/- 5 cents, Ignitron's centsTolerance.
//
//  * Model differences: Ignitron uses the same 0x01 0x65 / 0x03 0x64 / 0x03 0x65
//    messages for every Spark model it supports; whether a Spark 2 needs
//    anything different is an open question.
// ---------------------------------------------------------------------------

export const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"] as const;

/** Note byte Ignitron treats as "no note detected". */
export const TUNER_NO_NOTE = 0x0e;

/** Readings within this many cents of the note count as in tune. */
export const IN_TUNE_TOLERANCE_CENTS = 5;

/** The amp reports at most half a semitone either side of the note. */
export const MAX_OFFSET_CENTS = 50;

/**
 * After the app switches the tuner off, readings that were already in flight can
 * still arrive. They must not be taken as "the tuner was switched on at the amp".
 */
export const TRAILING_OUTPUT_GRACE_MS = 1500;

/** Name of the note for a raw note byte, or null when there is no note. */
export function getNoteName(note: number | null | undefined): string | null {
    if (note == null || !Number.isInteger(note) || note < 0 || note == TUNER_NO_NOTE) {
        return null;
    }
    return NOTE_NAMES[note % 12];
}

/**
 * Converts the raw offset float to cents from the note, clamped to +/- 50.
 * Returns null when the value cannot be a reading.
 */
export function offsetToCents(offset: number | null | undefined): number | null {
    if (offset == null || !Number.isFinite(offset)) {
        return null;
    }
    const cents = Math.round(offset * 100 - 50);
    return Math.max(-MAX_OFFSET_CENTS, Math.min(MAX_OFFSET_CENTS, cents));
}

export function isInTune(cents: number | null): boolean {
    return cents != null && Math.abs(cents) <= IN_TUNE_TOLERANCE_CENTS;
}

/** Needle position across the meter, 0 (50 cents flat) .. 50 (centre) .. 100 (50 cents sharp). */
export function needlePercent(cents: number | null): number {
    if (cents == null) {
        return 50;
    }
    return 50 + (Math.max(-MAX_OFFSET_CENTS, Math.min(MAX_OFFSET_CENTS, cents)) / MAX_OFFSET_CENTS) * 50;
}

export type TuningDirection = "flat" | "sharp" | "in-tune";

export interface TunerReadingView {
    hasNote: boolean;
    noteName: string | null;
    cents: number | null;
    inTune: boolean;
    direction: TuningDirection | null;
    needlePercent: number;
    /** e.g. "+12", "-3", "0" */
    centsLabel: string;
}

/** Everything the UI needs to show for a raw reading. */
export function describeTunerReading(note: number | null, offset: number | null): TunerReadingView {
    const noteName = getNoteName(note);
    const cents = noteName != null ? offsetToCents(offset) : null;
    const inTune = isInTune(cents);

    let direction: TuningDirection | null = null;
    if (cents != null) {
        direction = inTune ? "in-tune" : (cents < 0 ? "flat" : "sharp");
    }

    return {
        hasNote: noteName != null,
        noteName,
        cents,
        inTune,
        direction,
        needlePercent: needlePercent(cents),
        centsLabel: cents == null ? "" : (cents > 0 ? `+${cents}` : `${cents}`)
    };
}

// ---------------------------------------------------------------------------
// View model: keeps TunerStateStore in step with the amp
// ---------------------------------------------------------------------------

export interface TunerEvents {
    on(type: string, action: (event: any, args: any) => any): void;
    invoke(type: string, data: any): Promise<any>;
}

export class TunerViewModel {

    private lastDisabledAt = -Infinity;
    private unsubscribeConnection: () => void;

    constructor(private events: TunerEvents = platformEvents, private now: () => number = () => Date.now()) {
        // DeviceContext forwards tuner messages from the amp under their own event.
        this.events.on("tuner-message", (_event, msg: DeviceMessage) => this.handleMessage(msg));

        // After a disconnect the amp's tuner state is unknown (it may have been power
        // cycled), so start again from "off". This lives here rather than in TunerPanel
        // because the panel is unmounted while no amp is connected.
        this.unsubscribeConnection = DeviceStateStore.subscribe(
            s => s.isConnected,
            connected => { if (!connected) this.reset(); });
    }

    /** Stops following the connection state (used by tests). */
    dispose() {
        this.unsubscribeConnection?.();
    }

    /** Applies a tuner message received from the amp. */
    handleMessage(msg: DeviceMessage) {
        if (msg?.type == TUNER_MESSAGE_ONOFF) {
            const enabled = (<TunerOnOffMessage>msg).enabled === true;
            if (!enabled) {
                this.lastDisabledAt = this.now();
            }
            TunerStateStore.update(s => {
                s.isEnabled = enabled;
                if (!enabled) {
                    s.note = null;
                    s.offset = null;
                }
            });
        } else if (msg?.type == TUNER_MESSAGE_OUTPUT) {
            const reading = <TunerOutputMessage>msg;
            const state = TunerStateStore.getRawState();

            if (!state.isEnabled && (state.isPending || (this.now() - this.lastDisabledAt) < TRAILING_OUTPUT_GRACE_MS)) {
                // Our "tuner off" is still queued, or was only just written: the amp
                // keeps sending readings until it has processed it.
                return;
            }

            TunerStateStore.update(s => {
                // Readings only arrive while the tuner is on, so if we thought it was off
                // the tuner must have been switched on at the amp.
                s.isEnabled = true;
                s.note = reading.note;
                s.offset = reading.offset;
                s.lastReadingAt = this.now();
            });
        }
    }

    /**
     * Switches the amp's tuner on or off. Resolves false, puts the previous state back
     * and sets TunerStateStore.error if the frame could not be written to the amp.
     */
    async setEnabled(enabled: boolean): Promise<boolean> {
        const previous = TunerStateStore.getRawState().isEnabled;

        if (!enabled) {
            this.lastDisabledAt = this.now();
        }

        TunerStateStore.update(s => {
            s.isEnabled = enabled;
            s.isPending = true;
            s.error = null;
            if (!enabled) {
                s.note = null;
                s.offset = null;
            }
        });

        let ok = false;
        try {
            ok = (await this.events.invoke("perform-action", { action: "setTuner", data: enabled })) !== false;
        } catch {
            ok = false;
        }

        if (ok && !enabled) {
            // The command can wait behind others on the device manager's queue (e.g. a
            // Spark 2 preset upload), so the grace window for trailing readings starts
            // when the frame has actually been written.
            this.lastDisabledAt = this.now();
        }

        TunerStateStore.update(s => {
            s.isPending = false;
            if (ok) {
                s.isEnabled = enabled;
                if (!enabled) {
                    s.note = null;
                    s.offset = null;
                }
            } else {
                s.isEnabled = previous;
                s.error = `Could not switch the tuner ${enabled ? "on" : "off"}. Check the amp connection and try again.`;
            }
        });

        return ok;
    }

    toggle(): Promise<boolean> {
        return this.setEnabled(!TunerStateStore.getRawState().isEnabled);
    }

    /** Forgets all tuner state, e.g. when the amp disconnects. */
    reset() {
        this.lastDisabledAt = -Infinity;
        TunerStateStore.update(s => Object.assign(s, initialTunerState()));
    }
}

let sharedTunerViewModel: TunerViewModel | null = null;

/** The app-wide tuner view model, created (and subscribed to amp messages) on first use. */
export function getTunerViewModel(): TunerViewModel {
    if (sharedTunerViewModel == null) {
        sharedTunerViewModel = new TunerViewModel();
    }
    return sharedTunerViewModel;
}
