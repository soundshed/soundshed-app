import { DeviceMessage } from "./preset";

/**
 * Tuner messages exchanged with a Spark amp.
 *
 * Protocol (reverse engineered, mirrored from Ignitron's SparkMessage::switchTuner
 * and SparkStreamReader::readTuner / readTunerOnOff):
 *
 *   App -> Amp  0x01 0x65  payload: msgpack bool (0xc3 = on, 0xc2 = off)
 *   Amp -> App  0x03 0x65  payload: msgpack bool, the tuner was switched on/off
 *                          (sent when the tuner is toggled on the amp itself)
 *   Amp -> App  0x03 0x64  payload: one raw byte note number, then a msgpack
 *                          float32 (0xca + 4 bytes big endian) pitch offset.
 *                          Streamed continuously while the tuner is on.
 *
 * The raw values are passed through untouched; interpretation (note names,
 * cents) lives in src/core/tunerViewModel.ts.
 */

export const TUNER_MESSAGE_OUTPUT = "tuner_output";
export const TUNER_MESSAGE_ONOFF = "tuner_onoff";

/** Amp -> App 0x03 0x64: a single tuner reading. */
export interface TunerOutputMessage extends DeviceMessage {
    type: typeof TUNER_MESSAGE_OUTPUT;
    /** Raw note byte from the amp. See tunerViewModel.getNoteName for the mapping. */
    note: number;
    /** Raw float offset from the amp. See tunerViewModel.offsetToCents for the scale. */
    offset: number;
}

/** Amp -> App 0x03 0x65: the tuner was switched on or off. */
export interface TunerOnOffMessage extends DeviceMessage {
    type: typeof TUNER_MESSAGE_ONOFF;
    enabled: boolean;
}

export type TunerMessage = TunerOutputMessage | TunerOnOffMessage;

export function isTunerMessage(msg: DeviceMessage | null | undefined): msg is TunerMessage {
    return msg?.type === TUNER_MESSAGE_OUTPUT || msg?.type === TUNER_MESSAGE_ONOFF;
}
