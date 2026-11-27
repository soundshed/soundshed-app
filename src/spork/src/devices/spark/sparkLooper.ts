// Spark 2 looper protocol definitions.
//
// Reverse engineered by the Ignitron project (SparkMessage.cpp / SparkStreamReader.cpp):
//
//   App -> Amp  0x01 0x75  <command byte>                     looper transport command
//   App -> Amp  0x01 0x76  <settings>                         update looper settings
//   App -> Amp  0x02 0x75 / 0x02 0x76 / 0x02 0x78  (no data)  request record status / settings / status
//   Amp -> App  0x03 0x75  <command byte>                     transport command the amp executed
//   Amp -> App  0x03 0x76  <settings>                         looper settings
//   Amp -> App  0x03 0x77  <float>                            current position in the loop (0..1)
//   Amp -> App  0x03 0x78  <bpm> <count> <bars> <loops> <?> <?>  looper status
//
// Settings payload (msgpack-ish):
//   bpm        uint8, prefixed with 0xCC when >= 128
//   count      byte, 0x04 = straight, 0x03 = shuffle (Ignitron's naming)
//   bars       byte
//   free       on/off (0xC3 / 0xC2) - free length recording, bars ignored
//   click      on/off - metronome click, which also enables a one bar count-in
//   unknown    on/off - meaning not known, preserved as read from the amp
//   maxDuration 0xCD + uint16 big endian (milliseconds, 60000 by default)
//
// Audio transfer of recorded loops is not part of this protocol subset.

import { DeviceMessage } from "../../interfaces/preset";

export enum LooperCommand {
    CountIn = 0x02,
    Record = 0x04,
    StopRecord = 0x05,
    Retry = 0x06,
    RecordComplete = 0x07,
    Play = 0x08,
    Stop = 0x09,
    Delete = 0x0a,
    Dub = 0x0b,
    StopDub = 0x0c,
    Undo = 0x0d,
    Redo = 0x0e,
}

export const LOOPER_COUNT_STRAIGHT = 0x04;
export const LOOPER_COUNT_SHUFFLE = 0x03;

export const LOOPER_MIN_BPM = 30;
export const LOOPER_MAX_BPM = 255;
export const LOOPER_DEFAULT_MAX_DURATION = 60000;

export interface LooperSettings {
    bpm: number;
    count: number;
    bars: number;
    free: boolean;
    click: boolean;
    unknownOnOff: boolean;
    maxDuration: number;
}

export const DEFAULT_LOOPER_SETTINGS: LooperSettings = {
    bpm: 120,
    count: LOOPER_COUNT_STRAIGHT,
    bars: 4,
    free: false,
    click: true,
    unknownOnOff: false,
    maxDuration: LOOPER_DEFAULT_MAX_DURATION,
};

export interface LooperStatus {
    bpm: number;
    count: number;
    bars: number;
    loopCount: number;
    unknown1: number;
    unknown2: number;
}

// Messages pushed onto SparkMessageReader.receivedMessageQueue. Types are namespaced
// with "looper_" so they cannot collide with other features.
export interface LooperCommandMessage extends DeviceMessage {
    type: 'looper_command';
    command: number;
}

export interface LooperSettingsMessage extends DeviceMessage {
    type: 'looper_settings';
    settings: LooperSettings;
}

export interface LooperMeasureMessage extends DeviceMessage {
    type: 'looper_measure';
    measure: number;
}

export interface LooperStatusMessage extends DeviceMessage {
    type: 'looper_status';
    status: LooperStatus;
}

export type LooperMessage = LooperCommandMessage | LooperSettingsMessage | LooperMeasureMessage | LooperStatusMessage;

export const LOOPER_MESSAGE_TYPES: ReadonlyArray<LooperMessage['type']> = [
    'looper_command', 'looper_settings', 'looper_measure', 'looper_status'
];

export function isLooperMessage(msg: DeviceMessage | null | undefined): msg is LooperMessage {
    return !!msg && (LOOPER_MESSAGE_TYPES as ReadonlyArray<string>).indexOf(msg.type ?? "") > -1;
}

const clampInt = (value: number, min: number, max: number, fallback: number) => {
    const n = Math.round(Number(value));
    if (!Number.isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, n));
};

/** Returns settings with every field coerced into the range the wire format can carry. */
export function normaliseLooperSettings(settings: Partial<LooperSettings>): LooperSettings {
    const s = { ...DEFAULT_LOOPER_SETTINGS, ...(settings ?? {}) };
    return {
        bpm: clampInt(s.bpm, LOOPER_MIN_BPM, LOOPER_MAX_BPM, DEFAULT_LOOPER_SETTINGS.bpm),
        count: clampInt(s.count, 0, 0x7f, LOOPER_COUNT_STRAIGHT),
        bars: clampInt(s.bars, 0, 0x7f, DEFAULT_LOOPER_SETTINGS.bars),
        free: !!s.free,
        click: !!s.click,
        unknownOnOff: !!s.unknownOnOff,
        maxDuration: clampInt(s.maxDuration, 0, 0xffff, LOOPER_DEFAULT_MAX_DURATION),
    };
}

/** Encodes the 0x01 0x76 settings payload (8 bit, before 7 bit packing). */
export function encodeLooperSettingsPayload(settings: Partial<LooperSettings>): number[] {
    const s = normaliseLooperSettings(settings);
    const out: number[] = [];
    if (s.bpm >= 128) {
        out.push(0xcc);
    }
    out.push(s.bpm);
    out.push(s.count);
    out.push(s.bars);
    out.push(s.free ? 0xc3 : 0xc2);
    out.push(s.click ? 0xc3 : 0xc2);
    out.push(s.unknownOnOff ? 0xc3 : 0xc2);
    out.push(0xcd, (s.maxDuration >> 8) & 0xff, s.maxDuration & 0xff);
    return out;
}

const COMMAND_NAMES: Record<number, string> = {
    [LooperCommand.CountIn]: "Count-in",
    [LooperCommand.Record]: "Record",
    [LooperCommand.StopRecord]: "Stop record",
    [LooperCommand.Retry]: "Retry",
    [LooperCommand.RecordComplete]: "Record complete",
    [LooperCommand.Play]: "Play",
    [LooperCommand.Stop]: "Stop",
    [LooperCommand.Delete]: "Delete",
    [LooperCommand.Dub]: "Dub",
    [LooperCommand.StopDub]: "Stop dub",
    [LooperCommand.Undo]: "Undo",
    [LooperCommand.Redo]: "Redo",
};

export function looperCommandName(command: number): string {
    return COMMAND_NAMES[command] ?? `Unknown (0x${(command ?? 0).toString(16).padStart(2, "0")})`;
}
