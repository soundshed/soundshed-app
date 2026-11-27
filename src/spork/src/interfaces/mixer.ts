import { DeviceMessage } from "./preset";

/**
 * Amp mixer messages (EXPERIMENTAL).
 *
 * Protocol (documented for the Spark LIVE in paulhamsh/SparkBox SparkIO.ino, and
 * reported to change the guitar volume on a Spark GO by lucanenni/spark-go-utils).
 * A user's hardware test confirmed channels 0 (guitar) and 5 (music) on a Spark 2;
 * channel 9 and the Spark 40 / MINI are untested:
 *
 *   App -> Amp  0x01 0x33  payload: channel (msgpack positive fixint, 1 byte), then a
 *                          msgpack float32 (0xca + 4 bytes big endian) volume 0..1.
 *                          Whether a Spark 2 needs a trailing 0x00 (as it does for
 *                          0x01 0x04) was not recorded, so the caller chooses.
 *   App -> Amp  0x02 0x33  payload: channel byte. Asks for that channel's volume.
 *   Amp -> App  0x03 0x33  payload: msgpack float32. The reply does NOT say which
 *                          channel it is for, so requests have to be serialised.
 *   Amp -> App  0x03 0x6b  payload: msgpack float32, "input 1 guitar volume" as
 *                          reported by the amp (e.g. its guitar knob was turned).
 *   Amp -> App  0x04 0x33  ack of a mixer set.
 *
 * Channels on the Spark LIVE: 0 Input 1 (guitar), 1 Input 2 1/4", 2 Input 2 XLR,
 * 3 Input 3, 4 Input 4, 5 Music, 9 Master. Interpretation lives in
 * src/core/mixerViewModel.ts.
 */

export const MIXER_CHANNEL = {
    GUITAR: 0,
    MUSIC: 5,
    MASTER: 9,
} as const;

/** The channel byte is sent as a msgpack positive fixint, so 0..127. */
export const MIXER_MAX_CHANNEL = 0x7f;

export const MIXER_MESSAGE_VOLUME = "mixer_volume";
export const MIXER_MESSAGE_INPUT_VOLUME = "input_volume";
export const MIXER_MESSAGE_ACK = "mixer_ack";

/** Amp -> App 0x03 0x33: the volume of the channel last asked for. */
export interface MixerVolumeMessage extends DeviceMessage {
    type: typeof MIXER_MESSAGE_VOLUME;
    value: number;
    /** Only set if the amp unexpectedly sent the channel byte as well. */
    channel?: number;
}

/** Amp -> App 0x03 0x6b: the amp's guitar input volume changed. */
export interface InputVolumeMessage extends DeviceMessage {
    type: typeof MIXER_MESSAGE_INPUT_VOLUME;
    value: number;
}

/** Amp -> App 0x04/0x05 0x33: the amp acknowledged a mixer set. */
export interface MixerAckMessage extends DeviceMessage {
    type: typeof MIXER_MESSAGE_ACK;
    value: true;
}

export type MixerMessage = MixerVolumeMessage | InputVolumeMessage | MixerAckMessage;

export function isMixerMessage(msg: DeviceMessage | null | undefined): msg is MixerMessage {
    return msg?.type === MIXER_MESSAGE_VOLUME || msg?.type === MIXER_MESSAGE_INPUT_VOLUME || msg?.type === MIXER_MESSAGE_ACK;
}

export function isValidMixerChannel(channel: number): boolean {
    return Number.isInteger(channel) && channel >= 0 && channel <= MIXER_MAX_CHANNEL;
}

/** Clamps a volume to 0..1. Throws for values that are not numbers at all. */
export function clampMixerValue(value: number): number {
    if (typeof value != "number" || Number.isNaN(value)) {
        throw new RangeError(`Mixer volume must be a number, got ${value}`);
    }
    return Math.min(1, Math.max(0, value));
}
