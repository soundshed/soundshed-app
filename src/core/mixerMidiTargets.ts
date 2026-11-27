/**
 * MIDI mapping targets for the amp mixer (EXPERIMENTAL): "mixer-volume" (continuous,
 * like fx-param) and "mixer-mute" (a switch like fx-onoff, "on" = muted).
 *
 * The engine (midiMapping.ts) acts on them through MidiMappingSink, and the controller
 * (midiMappingController.ts) forwards to MixerViewModel.setVolume / setMuted. This
 * module only holds the pure helpers the mapping editor and the nav-bar learn menu
 * share: names, labels and new mappings.
 */
import { EventTargetMapping, InputEventMapping, MidiEventSource, MIDI_CHANNEL_ANY } from "../spork/src/interfaces/inputEventMapping";
import { MIXER_CHANNEL } from "../spork/src/interfaces/mixer";
import { newMappingId, parseMixerChannel, SWITCH_ON_VALUE } from "./midiMapping";

export type MixerTargetType = "mixer-volume" | "mixer-mute";

export const isMixerTargetType = (type: any): type is MixerTargetType => type === "mixer-volume" || type === "mixer-mute";

/** The channels offered when adding a mapping (saved mappings may name any channel). */
export const MIXER_MIDI_CHANNELS: ReadonlyArray<{ channel: number; label: string }> = [
    { channel: MIXER_CHANNEL.GUITAR, label: "Guitar" },
    { channel: MIXER_CHANNEL.MUSIC, label: "Music" },
];

/** e.g. "Guitar", "Music", "Master", or "Mixer ch 3" for a probed channel. */
export function mixerChannelName(channel: number): string {
    if (channel === MIXER_CHANNEL.MASTER) return "Master";
    return MIXER_MIDI_CHANNELS.find((c) => c.channel === channel)?.label ?? `Mixer ch ${channel}`;
}

/** e.g. "Guitar volume", "Music mute". */
export function describeMixerTarget(target: EventTargetMapping): string {
    const channel = parseMixerChannel(target?.value);
    const what = target?.type === "mixer-mute" ? "mute" : "volume";
    if (channel == null) return `Amp ${what} (invalid channel)`;
    return `${mixerChannelName(channel)} ${what}`;
}

/** Whether a mapping targets this mixer control. */
export const isMixerMapping = (m: InputEventMapping, type: MixerTargetType, channel: number) =>
    m?.target?.type === type && parseMixerChannel(m.target.value) === channel;

/**
 * A target with the same defaults as a new fx-param / fx-onoff one, except that the
 * mute's threshold (used only once switched to threshold mode) is mid travel: muting
 * as soon as a pedal leaves heel, as the wah's on/off does, would be a surprise.
 */
export function buildMixerTarget(type: MixerTargetType, channel: number): EventTargetMapping {
    return type === "mixer-volume"
        ? { type, value: channel.toString(), min: 0, max: 1, invert: false, curve: "linear" }
        : { type, value: channel.toString(), mode: "toggle", threshold: SWITCH_ON_VALUE };
}

/** A new, not yet learned mapping, e.g. "MIDI → Guitar volume". */
export function buildMixerMapping(type: MixerTargetType, channel: number, makeId: () => string = newMappingId): InputEventMapping {
    const target = buildMixerTarget(type, channel);
    const source: MidiEventSource = { type: "midi", kind: "cc", code: "", channel: MIDI_CHANNEL_ANY };
    return { id: makeId(), name: `MIDI → ${describeMixerTarget(target)}`, source, target };
}
