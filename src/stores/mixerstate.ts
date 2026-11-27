import { Store } from "pullstate";

/** Outcome of the last read of a channel: none yet, waiting, answered, or no answer in time. */
export type MixerReadStatus = "idle" | "pending" | "ok" | "no-reply" | "error";

export interface IMixerChannelState {
    /** The last value we sent or read (0..1), null while unknown. */
    value: number | null;
    /** The value the amp answered with on the last read. */
    lastReadValue?: number;
    /** Date.now() of that answer. */
    lastReadAt?: number;
    readStatus: MixerReadStatus;
    /** The last read answered after an earlier read of the same pass timed out, so it may be that one's late reply. */
    readUncertain?: boolean;
    /** The last value actually written to the amp, and when. */
    lastSentValue?: number;
    lastSentAt?: number;
    /** Muted from the app: 0 was sent and unmuteValue is the level to go back to. */
    muted?: boolean;
    /** Level restored on unmute; null when it was unknown or 0 (unmute then leaves the level at 0). */
    unmuteValue?: number | null;
    /** The last set of this channel could not be written to the amp (cleared by the next one that is). */
    sendFailed?: boolean;
}

export interface IMixerState {
    /** Keyed by mixer channel number (0 guitar, 5 music, or a probed one such as 9 master). */
    channels: Record<number, IMixerChannelState>;
    /** Latest 0x03 0x6b input volume notification from the amp, null if none. */
    lastInputVolume: number | null;
    lastInputVolumeAt: number | null;
    /** 0x04 0x33 acks seen since connecting. */
    ackCount: number;
    lastAckAt: number | null;
    /** Append 0x00 to the set message. null follows the model (on for a Spark 2, like 0x01 0x04). */
    trailingZero: boolean | null;
    /** A "Read from amp" pass is running. */
    isReading: boolean;
    lastError: string | null;
}

export const initialMixerChannelState = (): IMixerChannelState => ({
    value: null,
    readStatus: "idle",
});

export const initialMixerState = (): IMixerState => ({
    channels: {},
    lastInputVolume: null,
    lastInputVolumeAt: null,
    ackCount: 0,
    lastAckAt: null,
    trailingZero: null,
    isReading: false,
    lastError: null,
});

export const MixerStateStore = new Store<IMixerState>(initialMixerState());
