
/**
 * Defines the interface for a class that maps an input event to a target.
 * e.g. Midi Input > Preset Selection
 * */
export interface InputEventMapping {
    id: string;
    name: string; // e.g. Map Midi A3 to Preset Channel 1
    source: MidiEventSource | KeyboardEventSource; // e.g. {type:'midi','ch':1,'note':57};
    target: EventTargetMapping; // e.g. {type:'channel',value:0};
}

/**
 * What kind of MIDI message a source listens for.
 * A source without a kind is a legacy mapping (saved before kinds existed): its code is
 * matched against a note number or a program number and its channel is ignored.
 */
export type MidiSourceKind = "note" | "cc" | "program";

/** Channel value meaning "any MIDI channel". */
export const MIDI_CHANNEL_ANY = "any";

export interface MidiEventSource {
    type: string; // "midi"
    kind?: MidiSourceKind; // absent = legacy note/program mapping
    deviceId?: string; // MIDI input name, e.g. MicroKey25. Absent or empty = any input
    channel: string; // "1".."16", or "any"
    code: string; // note number, controller number or program number
}

export interface KeyboardEventSource {
    type: string; // "keyboard"
    code: string; // key code
}

/**
 * Target types implemented by the MIDI mapping engine. Other features can register
 * handlers for further types (e.g. "tuner-toggle", "looper-command") without changing
 * the mapping model: unknown target types are simply passed to a registered handler.
 */
export type EventTargetType = "amp-channel" | "fx-param" | "fx-onoff" | "tuner-toggle" | "looper-command";

export type ValueCurve = "linear" | "log";

export type FxOnOffMode = "toggle" | "momentary" | "threshold";

export interface EventTargetMapping {
    type: string; // one of EventTargetType, or a type registered by another feature
    value?: string; // amp-channel: channel index 0-n. Free-form for other target types.

    /** fx-param / fx-onoff: the effect, as used in the current tone (e.g. pg.spark40.JH.Vox846) */
    dspId?: string;

    /** fx-param: parameter index within the effect */
    paramIndex?: number;
    /** fx-param: output range, in the amp's 0..1 parameter scale */
    min?: number;
    max?: number;
    invert?: boolean;
    curve?: ValueCurve;

    /** fx-onoff: how incoming values switch the effect */
    mode?: FxOnOffMode;
    /** fx-onoff threshold mode: raw 0..127 value at/above which the effect is on */
    threshold?: number;
}

export interface FxParamTarget extends EventTargetMapping {
    type: "fx-param";
    dspId: string;
    paramIndex: number;
    min: number;
    max: number;
    invert: boolean;
    curve: ValueCurve;
}

export interface FxOnOffTarget extends EventTargetMapping {
    type: "fx-onoff";
    dspId: string;
    mode: FxOnOffMode;
    threshold?: number;
}
