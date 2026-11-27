/**
 * App glue for MIDI mappings: feeds incoming MIDI messages to the mapping engine, sends
 * the results to the amp through the device view model, keeps the live meter / learn
 * state for the mapping editor, and edits + persists the mapping list.
 *
 * WebMidi itself is handled by components/device/input-events.tsx, which passes every
 * received message to handleMidiEvent().
 */
import { InputEventMapping } from "../spork/src/interfaces/inputEventMapping";
import { AppStateStore } from "../stores/appstate";
import { DeviceStateStore } from "../stores/devicestate";
import { MidiStateStore } from "../stores/midistate";
import {
    buildExpressionWahMappings,
    findWahTarget,
    isLearnableEvent,
    KeyedThrottle,
    MidiMappingEngine,
    MidiMappingSink,
    MidiTargetHandler,
    normaliseMidiEvent,
    NormalisedMidiEvent,
    sourceFromEvent,
} from "./midiMapping";

/** The parts of DeviceViewModel the MIDI mappings use. */
export interface MidiDeviceActions {
    setChannel(channelNum: number): Promise<boolean>;
    requestFxParamChangeImmediate(args: { dspId: string; index: number; value: number }): Promise<boolean>;
    requestFxToggle(args: { dspId: string; value: number }): Promise<boolean>;
}

const METER_UPDATE_INTERVAL_MS = 40;
const DEFAULT_LEARN_TIMEOUT_MS = 10000;

const currentTone = (): any => DeviceStateStore.getRawState().presetTone;

const findFx = (dspId: string) => currentTone()?.fx?.find((f) => f.type === dspId);

export class MidiMappingController {
    readonly engine: MidiMappingEngine;

    private device: MidiDeviceActions | null = null;
    private persist: () => void = () => { };
    private learnTimer: any = null;
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
        };
        this.engine = new MidiMappingEngine(sink);
    }

    /** Connects the controller to the amp and to settings persistence. */
    attach(device: MidiDeviceActions, persist: () => void) {
        this.device = device;
        this.persist = persist;
    }

    /** Lets other features handle their own target types (e.g. tuner or looper). */
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

        const mappings: InputEventMapping[] = AppStateStore.getRawState().inputEventMappings ?? [];
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

    startLearn(mappingIds: string[], timeoutMs: number = DEFAULT_LEARN_TIMEOUT_MS) {
        this.clearLearnTimer();
        MidiStateStore.update((s) => {
            s.learningMappingIds = [...mappingIds];
            s.learnStatus = "Move a control or press a key on your MIDI device…";
        });
        this.learnTimer = setTimeout(() => {
            this.learnTimer = null;
            MidiStateStore.update((s) => {
                s.learningMappingIds = [];
                s.learnStatus = "No MIDI input received, learn cancelled.";
            });
        }, timeoutMs);
    }

    cancelLearn() {
        this.clearLearnTimer();
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

    private completeLearn(ev: NormalisedMidiEvent) {
        const ids = MidiStateStore.getRawState().learningMappingIds;
        this.clearLearnTimer();
        const source = sourceFromEvent(ev);
        this.updateMappings((mappings) =>
            mappings.map((m) => (ids.includes(m.id) ? { ...m, source: { ...source } } : m))
        );
        MidiStateStore.update((s) => {
            s.learningMappingIds = [];
            s.learnStatus = null;
        });
    }

    /* ---------- mapping edits ---------- */

    getMappings(): InputEventMapping[] {
        return AppStateStore.getRawState().inputEventMappings ?? [];
    }

    updateMappings(change: (mappings: InputEventMapping[]) => InputEventMapping[]) {
        const next = change(this.getMappings().slice());
        AppStateStore.update((s) => {
            s.inputEventMappings = next;
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
     * One-click "Expression pedal -> Wah position" for the current preset. Adds the
     * mappings (CC 11, any channel) and starts learn so the pedal actually used is captured.
     */
    addExpressionWahPreset(autoEnable: boolean): { ok: boolean; message: string } {
        const wah = findWahTarget(currentTone(), DeviceStateStore.getRawState().fxCatalog);
        if (!wah) {
            return { ok: false, message: "No wah found in the current preset. Add a wah to the signal chain first." };
        }
        const mappings = buildExpressionWahMappings(wah, { autoEnable });
        this.addMappings(mappings);
        this.startLearn(mappings.map((m) => m.id));
        return { ok: true, message: `Mapped expression pedal to ${wah.name} (${wah.paramName}). Move the pedal to learn it.` };
    }
}

export const midiMappingController = new MidiMappingController();
