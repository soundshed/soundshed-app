/**
 * App glue for MIDI mappings: feeds incoming MIDI messages to the mapping engine, sends
 * the results to the amp through the device view model, keeps the live meter / learn
 * state for the mapping editor, and edits + persists the control mapping list.
 *
 * Control mappings (CC / typed sources, effect targets) are kept in
 * AppStateStore.midiControlMappings, separate from the legacy inputEventMappings list that
 * the Settings "Input Event Mappings" table edits. Incoming messages are matched against both.
 *
 * WebMidi itself is handled by components/device/input-events.tsx, which passes every
 * received message to handleMidiEvent().
 *
 * Amp mixer targets (mixer-volume / mixer-mute) go to the MixerViewModel attached with
 * attachMixer() (app.tsx), and only while an amp is connected: they are never applied
 * on load or connect, only when a matching MIDI message comes in.
 */
import { InputEventMapping } from "../spork/src/interfaces/inputEventMapping";
import { AppStateStore } from "../stores/appstate";
import { DeviceStateStore } from "../stores/devicestate";
import { MidiStateStore } from "../stores/midistate";
import { MixerStateStore } from "../stores/mixerstate";
import {
    buildExpressionWahMappings,
    findWahTarget,
    isLearnableEvent,
    isMidiSource,
    KeyedThrottle,
    matchesSource,
    MidiMappingEngine,
    MidiMappingSink,
    MidiTargetHandler,
    normaliseMidiEvent,
    NormalisedMidiEvent,
    sourceFromEvent,
} from "./midiMapping";
import { buildMixerMapping, isMixerMapping, MixerTargetType } from "./mixerMidiTargets";

/** The parts of DeviceViewModel the MIDI mappings use. */
export interface MidiDeviceActions {
    setChannel(channelNum: number): Promise<boolean>;
    requestFxParamChangeImmediate(args: { dspId: string; index: number; value: number }): Promise<boolean>;
    requestFxToggle(args: { dspId: string; value: number }): Promise<boolean>;
}

/** The parts of MixerViewModel the mixer-volume / mixer-mute mappings use. */
export interface MidiMixerActions {
    setVolume(channel: number, value: number): Promise<boolean>;
    setMuted(channel: number, muted: boolean): Promise<boolean>;
}

export interface StartLearnOptions {
    /**
     * Remove these mappings again if learn ends without capturing a control (timeout,
     * cancel, or another learn starting), e.g. ones created just for this learn.
     */
    discardIfUnlearned?: boolean;
    /**
     * Mappings of the same control as the learned ones: once learned, those of them the
     * learned MIDI message also triggers are removed, so one control isn't mapped twice
     * to the same switch (two toggles on one footswitch would cancel each other out).
     */
    sameControl?: (mapping: InputEventMapping) => boolean;
}

const METER_UPDATE_INTERVAL_MS = 40;

export const NO_INPUT_LISTENED_HINT =
    "No MIDI input is being listened to: select one under MIDI Input, or tick \u201cListen to all MIDI inputs\u201d.";
const DEFAULT_LEARN_TIMEOUT_MS = 10000;

const currentTone = (): any => DeviceStateStore.getRawState().presetTone;

const findFx = (dspId: string) => currentTone()?.fx?.find((f) => f.type === dspId);

/** Whether a mapping's source has been learned (a new one has an empty code). */
const isLearned = (m: InputEventMapping) => isMidiSource(m.source) && `${m.source.code ?? ""}`.trim() !== "";

export class MidiMappingController {
    readonly engine: MidiMappingEngine;

    private device: MidiDeviceActions | null = null;
    private mixer: MidiMixerActions | null = null;
    private persist: () => void = () => { };
    private learnTimer: any = null;
    private discardIfUnlearned: string[] = [];
    private learnSameControl: ((mapping: InputEventMapping) => boolean) | null = null;
    private meterThrottle = new KeyedThrottle<null>(METER_UPDATE_INTERVAL_MS);
    private pendingMeter: { ev: NormalisedMidiEvent | null; values: Record<string, number> } = { ev: null, values: {} };

    constructor() {
        const sink: MidiMappingSink = {
            setAmpChannel: (channel) => {
                this.device?.setChannel(channel).catch((err) => {
                    console.log("Failed to set channel. Device may not be connected " + err);
                });
            },
            setFxParam: (dspId, paramIndex, value) => {
                const fx = findFx(dspId);
                if (!fx || !fx.params?.some((p) => p.paramId == paramIndex.toString())) {
                    console.debug(`MIDI mapping: ${dspId} param ${paramIndex} is not in the current preset`);
                    return;
                }
                this.device?.requestFxParamChangeImmediate({ dspId, index: paramIndex, value }).catch((err) => {
                    console.log("Failed to set fx param from MIDI: " + err);
                });
            },
            setFxEnabled: (dspId, enabled) => {
                if (!findFx(dspId)) {
                    console.debug(`MIDI mapping: ${dspId} is not in the current preset`);
                    return;
                }
                this.device?.requestFxToggle({ dspId, value: enabled ? 1 : 0 }).catch((err) => {
                    console.log("Failed to toggle fx from MIDI: " + err);
                });
            },
            isFxEnabled: (dspId) => {
                const fx = findFx(dspId);
                return fx ? fx.enabled === true : undefined;
            },
            // no amp, no mixer: the engine drops mixer events instead of queueing them
            isMixerAvailable: () => this.mixer != null && DeviceStateStore.getRawState().isConnected === true,
            setMixerVolume: (channel, value) => {
                this.mixer?.setVolume(channel, value).catch((err) => {
                    console.log("Failed to set mixer volume from MIDI: " + err);
                });
            },
            setMixerMuted: (channel, muted) => {
                this.mixer?.setMuted(channel, muted).catch((err) => {
                    console.log("Failed to set mixer mute from MIDI: " + err);
                });
            },
            isMixerMuted: (channel) => MixerStateStore.getRawState().channels[channel]?.muted === true,
        };
        this.engine = new MidiMappingEngine(sink);
    }

    /** Connects the controller to the amp and to settings persistence. */
    attach(device: MidiDeviceActions, persist: () => void) {
        this.device = device;
        this.persist = persist;
    }

    /** Connects the mixer-volume / mixer-mute targets to the amp mixer. */
    attachMixer(mixer: MidiMixerActions) {
        this.mixer = mixer;
    }

    /** Lets other features handle their own target types (e.g. the tuner). */
    registerTargetHandler(type: string, handler: MidiTargetHandler) {
        return this.engine.registerTargetHandler(type, handler);
    }

    /** Entry point for every MIDI message received on a listened input. */
    handleMidiEvent(raw: any): NormalisedMidiEvent | null {
        const ev = normaliseMidiEvent(raw);
        if (ev == null) return null;

        if (MidiStateStore.getRawState().learningMappingIds.length > 0 && isLearnableEvent(ev)) {
            this.completeLearn(ev);
            this.updateMeter(ev, []);
            return ev;
        }

        const state = AppStateStore.getRawState();
        const mappings: InputEventMapping[] = [...(state.inputEventMappings ?? []), ...(state.midiControlMappings ?? [])];
        const result = this.engine.handleEvent(ev, mappings);
        if (!result.duplicate) {
            this.updateMeter(ev, result.matched);
        }
        return ev;
    }

    private updateMeter(ev: NormalisedMidiEvent, matched: InputEventMapping[]) {
        this.pendingMeter.ev = ev;
        for (const m of matched) this.pendingMeter.values[m.id] = ev.value;
        // the meter is cosmetic, so it doesn't need to re-render at the full MIDI rate
        this.meterThrottle.push("meter", null, () => {
            const { ev: lastEvent, values } = this.pendingMeter;
            this.pendingMeter = { ev: null, values: {} };
            MidiStateStore.update((s) => {
                if (lastEvent) s.lastEvent = lastEvent;
                Object.assign(s.lastValues, values);
            });
        });
    }

    /* ---------- MIDI learn ---------- */

    startLearn(mappingIds: string[], timeoutMs: number = DEFAULT_LEARN_TIMEOUT_MS, options: StartLearnOptions = {}) {
        this.clearLearnTimer();
        this.dropUnlearned(mappingIds);
        this.discardIfUnlearned = options.discardIfUnlearned ? [...mappingIds] : [];
        this.learnSameControl = options.sameControl ?? null;
        MidiStateStore.update((s) => {
            s.learningMappingIds = [...mappingIds];
            s.learnStatus = "Move a control or press a key on your MIDI device…";
        });
        this.learnTimer = setTimeout(() => {
            this.learnTimer = null;
            this.learnSameControl = null;
            this.dropUnlearned();
            MidiStateStore.update((s) => {
                s.learningMappingIds = [];
                s.learnStatus = AppStateStore.getRawState().isMidiInputAvailable
                    ? "No MIDI input received, learn cancelled."
                    : NO_INPUT_LISTENED_HINT + " Learn cancelled.";
            });
        }, timeoutMs);
    }

    cancelLearn() {
        this.clearLearnTimer();
        this.learnSameControl = null;
        this.dropUnlearned();
        MidiStateStore.update((s) => {
            s.learningMappingIds = [];
            s.learnStatus = null;
        });
    }

    private clearLearnTimer() {
        if (this.learnTimer != null) {
            clearTimeout(this.learnTimer);
            this.learnTimer = null;
        }
    }

    /** Removes the mappings a learn was told to discard if they are still not learned (except `keep`). */
    private dropUnlearned(keep: string[] = []) {
        const ids = this.discardIfUnlearned.filter((id) => !keep.includes(id));
        this.discardIfUnlearned = [];
        if (ids.length === 0) return;
        if (!this.getMappings().some((m) => ids.includes(m.id) && !isLearned(m))) return;
        this.updateMappings((current) => current.filter((m) => !ids.includes(m.id) || isLearned(m)));
    }

    private completeLearn(ev: NormalisedMidiEvent) {
        const ids = MidiStateStore.getRawState().learningMappingIds;
        this.clearLearnTimer();
        this.discardIfUnlearned = [];
        const sameControl = this.learnSameControl;
        this.learnSameControl = null;
        const source = sourceFromEvent(ev);
        // checked against the sources from before the learn
        const duplicate = (m: InputEventMapping) => !ids.includes(m.id) && sameControl != null && sameControl(m) && matchesSource(m.source, ev);
        this.updateMappings((mappings) =>
            mappings
                .filter((m) => !duplicate(m))
                .map((m) => (ids.includes(m.id) ? { ...m, source: { ...source } } : m))
        );
        MidiStateStore.update((s) => {
            s.learningMappingIds = [];
            s.learnStatus = null;
        });
    }

    /* ---------- mapping edits ---------- */

    /** The control mappings this controller edits (not the legacy amp channel list). */
    getMappings(): InputEventMapping[] {
        return AppStateStore.getRawState().midiControlMappings ?? [];
    }

    updateMappings(change: (mappings: InputEventMapping[]) => InputEventMapping[]) {
        const next = change(this.getMappings().slice());
        AppStateStore.update((s) => {
            s.midiControlMappings = next;
        });
        this.persist();
    }

    addMappings(mappings: InputEventMapping[]) {
        this.updateMappings((current) => [...current, ...mappings]);
    }

    removeMapping(id: string) {
        this.updateMappings((current) => current.filter((m) => m.id !== id));
        this.engine.reset();
    }

    /**
     * MIDI learn from a nav-bar mixer control, which re-assigns the control (like the
     * webaudio-controls knobs' Learn): its one mapping is re-learned in place (keeping
     * its range / mode settings); with none, a mapping is added, and removed again if
     * nothing is learned; with several (set up in Settings) another one is added. Either
     * way, once learned, any other mapping of the control on that same MIDI message is
     * removed. Returns the id of the mapping being learned.
     */
    learnMixerTarget(type: MixerTargetType, channel: number): string {
        const sameControl = (m: InputEventMapping) => isMixerMapping(m, type, channel);
        const existing = this.getMappings().filter(sameControl);
        if (existing.length === 1) {
            this.startLearn([existing[0].id], DEFAULT_LEARN_TIMEOUT_MS, { sameControl });
            return existing[0].id;
        }
        const mapping = buildMixerMapping(type, channel);
        this.addMappings([mapping]);
        this.startLearn([mapping.id], DEFAULT_LEARN_TIMEOUT_MS, { discardIfUnlearned: true, sameControl });
        return mapping.id;
    }

    /** Removes every mapping to this mixer control (the learn menu's "Clear"). */
    clearMixerTarget(type: MixerTargetType, channel: number) {
        const ids = this.getMappings().filter((m) => isMixerMapping(m, type, channel)).map((m) => m.id);
        if (ids.length === 0) return;
        if (MidiStateStore.getRawState().learningMappingIds.some((id) => ids.includes(id))) this.cancelLearn();
        this.updateMappings((current) => current.filter((m) => !ids.includes(m.id)));
        this.engine.reset();
    }

    patchMapping(id: string, patch: { name?: string; source?: object; target?: object }) {
        this.updateMappings((current) =>
            current.map((m) =>
                m.id !== id
                    ? m
                    : {
                        ...m,
                        name: patch.name ?? m.name,
                        source: patch.source ? <any>{ ...m.source, ...patch.source } : m.source,
                        target: patch.target ? { ...m.target, ...patch.target } : m.target,
                    }
            )
        );
    }

    setListenAllInputs(listenAll: boolean) {
        AppStateStore.update((s) => {
            s.midiListenAllInputs = listenAll;
        });
        this.persist();
    }

    /**
     * One-click "Expression pedal -> Wah" for the current preset. Adds the mappings (CC 11,
     * any channel) to a continuous wah parameter (Sensitivity on the Spark's Vox 846, which
     * has no pedal-position parameter) and starts learn so the pedal actually used is captured.
     */
    addExpressionWahPreset(autoEnable: boolean): { ok: boolean; message: string } {
        const wah = findWahTarget(currentTone(), DeviceStateStore.getRawState().fxCatalog);
        if (!wah) {
            return { ok: false, message: "No wah with a continuous parameter found in the current preset. Add a wah to the signal chain first." };
        }
        const mappings = buildExpressionWahMappings(wah, { autoEnable });
        this.addMappings(mappings);
        this.startLearn(mappings.map((m) => m.id));
        return { ok: true, message: `Mapped expression pedal to ${wah.name} (${wah.paramName}). Move the pedal to learn it.` };
    }
}

export const midiMappingController = new MidiMappingController();
