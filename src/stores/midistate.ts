import { Store } from "pullstate";
import type { NormalisedMidiEvent } from "../core/midiMapping";

/**
 * Live (non persisted) MIDI state for the mapping editor: the latest incoming message,
 * the latest raw value seen per mapping, and the MIDI learn status.
 * Mappings themselves and the input selection are persisted in AppStateStore.
 */
export const MidiStateStore = new Store({
    lastEvent: null as NormalisedMidiEvent | null,
    /** mapping id -> latest raw 0..127 value that matched it */
    lastValues: {} as Record<string, number>,
    /** mappings whose source the next incoming message will be learned into */
    learningMappingIds: [] as string[],
    learnStatus: null as string | null,
});
