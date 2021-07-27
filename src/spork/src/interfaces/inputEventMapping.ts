
/**
 * Defines the interface for a class that maps an input event to a target.
 * e.g. Midi Input > Preset Selection
 * */
export interface InputEventMapping {
    name: string; // e.g. Map Midi A3 to Preset Channel 1
    source: MidiEventSource | KeyboardEventSource; // e.g. {type:'midi','ch':1,'note':57};
    target: EventTargetMapping; // e.g. {type:'channel',value:0};
}

export interface MidiEventSource {
    type: string; // "midi"
    deviceId: string; // e.g. MicroKey25
    channel: number; // channel
    code: number; // note
}

export interface KeyboardEventSource {
    type: string; // "keyboard"
    code: number; // key code
}

export interface EventTargetMapping {
    type: string; // e.g. "channel"
    value: string; // e.g. 1-4
}