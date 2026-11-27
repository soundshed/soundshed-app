// Spark 2 looper control.
//
// Transport state and the composite Rec/Dub, Play/Stop and Undo/Redo actions follow
// Ignitron's SparkDataControl (sparkLooperRecDub, sparkLooperPlayStop,
// sparkLooperUndoRedo, updateLooperCommand). State lives in LooperStateStore so the
// looper never touches DeviceStateStore or DeviceViewModel.
//
// looperCommand(LooperCommand.X) and performLooperAction(id) with the LOOPER_ACTIONS
// list are there so input mappings (MIDI / keyboard) can drive the looper later.

import { DeviceMessage, BpmMessage } from "../spork/src/interfaces/preset";
import {
    DEFAULT_LOOPER_SETTINGS,
    isLooperMessage,
    LooperCommand,
    LooperMessage,
    LooperSettings,
    normaliseLooperSettings,
} from "../spork/src/devices/spark/sparkLooper";
import { DeviceStateStore } from "../stores/devicestate";
import { ILooperState, initialLooperState, LooperStateStore } from "../stores/looperstate";
import { isSpark2DeviceName } from "./sparkModels";

/** The part of SparkDeviceManager the looper needs. */
export interface LooperDevice {
    onStateChanged: any;
    sendLooperCommand(command: LooperCommand): Promise<void>;
    updateLooperSettings(settings: Partial<LooperSettings>): Promise<void>;
    requestLooperState(): Promise<void>;
    isSpark2Device(): boolean;
}

/** Where the view model learns that the amp connection went away (DeviceStateStore in the app). */
export interface LooperConnectionSource {
    getRawState(): { isConnected: boolean };
    subscribe(getSubState: (state: any) => boolean, onChange: (isConnected: boolean) => void): () => void;
}

const NO_DEVICE_ERROR = "The looper is not linked to an amp connection yet.";

export type LooperSupport = "spark2" | "other" | "unknown" | "disconnected";

/**
 * Only the Spark 2 has the looper. A connected amp whose name does not identify the
 * model is reported as "unknown" so the UI can still offer the looper with a caveat.
 */
export function getLooperSupport(isConnected: boolean, deviceName: string | null | undefined, isSpark2Device = false): LooperSupport {
    if (!isConnected) return "disconnected";
    if (isSpark2Device || isSpark2DeviceName(deviceName)) return "spark2";
    if (deviceName && /spark/i.test(deviceName)) return "other";
    return "unknown";
}

export type LooperActionId = "rec-dub" | "play-stop" | "undo-redo" | "delete" | "retry";

/** High level looper actions, suitable as input mapping targets. */
export const LOOPER_ACTIONS: ReadonlyArray<{ id: LooperActionId; name: string }> = [
    { id: "rec-dub", name: "Looper Rec / Dub" },
    { id: "play-stop", name: "Looper Play / Stop" },
    { id: "undo-redo", name: "Looper Undo / Redo" },
    { id: "delete", name: "Looper Delete" },
    { id: "retry", name: "Looper Retry" },
];

export const LOOPER_BARS_OPTIONS = [1, 2, 4, 8, 12, 16];

// Ignitron's looper timer assumes four beats per bar.
export const LOOPER_BEATS_PER_BAR = 4;

/** State change implied by a transport command, whether we sent it or the amp reported it. */
export function applyLooperCommand(state: ILooperState, command: number): Partial<ILooperState> {
    switch (command) {
        case LooperCommand.CountIn:
            return { isCountingIn: true };
        case LooperCommand.Record:
            return { isCountingIn: false, isRecording: true };
        case LooperCommand.StopRecord:
        case LooperCommand.Retry:
            return { isRecording: false };
        case LooperCommand.RecordComplete:
        case LooperCommand.StopDub:
            return { isRecording: false, hasLoop: true };
        case LooperCommand.Play:
            return { isPlaying: true };
        case LooperCommand.Stop:
            return { isPlaying: false, isCountingIn: false };
        case LooperCommand.Delete:
            return { isCountingIn: false, isRecording: false, isPlaying: false, hasLoop: false, canRedo: false, loopCount: 0, measure: null };
        case LooperCommand.Dub:
            // a new layer makes any undone layer unreachable
            return { isRecording: true, canRedo: false };
        case LooperCommand.Undo:
            return { canRedo: true };
        case LooperCommand.Redo:
            return { canRedo: false };
        default:
            return {};
    }
}

export interface LooperButtonLabels {
    recDub: string;
    playStop: string;
    undoRedo: string;
}

export function getLooperButtonLabels(state: ILooperState): LooperButtonLabels {
    let recDub: string;
    if (state.isCountingIn) {
        recDub = "Cancel Count-in";
    } else if (state.isRecording) {
        recDub = state.hasLoop ? "Stop Dub" : "Stop Rec";
    } else {
        recDub = state.hasLoop ? "Dub" : "Rec";
    }

    return {
        recDub,
        playStop: (state.isPlaying || state.isRecording || state.isCountingIn) ? "Stop" : "Play",
        undoRedo: state.canRedo ? "Redo" : "Undo",
    };
}

export function getLooperStatusText(state: ILooperState): string {
    if (state.isCountingIn) return "Count-in";
    if (state.isRecording) return state.hasLoop ? "Overdubbing" : "Recording";
    if (state.isPlaying) return "Playing";
    if (state.hasLoop) return "Stopped";
    return "Empty";
}

/**
 * Converts the amp's loop position (0..1) into a 1-based bar and beat, as Ignitron's
 * SparkLooperControl::setMeasure does. Returns null if the bar count is not known.
 */
export function measureToPosition(measure: number | null, bars: number | null | undefined, beatsPerBar = LOOPER_BEATS_PER_BAR): { bar: number; beat: number } | null {
    if (measure == null || !Number.isFinite(measure) || !bars || bars <= 0) return null;
    const clamped = Math.min(Math.max(measure, 0), 0.999999);
    const totalBeat = Math.floor(clamped * beatsPerBar * bars);
    return { bar: Math.floor(totalBeat / beatsPerBar) + 1, beat: (totalBeat % beatsPerBar) + 1 };
}

/** Length of one count-in bar in milliseconds. */
export function countInDurationMs(bpm: number, beatsPerBar = LOOPER_BEATS_PER_BAR): number {
    const safeBpm = bpm > 0 ? bpm : DEFAULT_LOOPER_SETTINGS.bpm;
    return Math.round(beatsPerBar * 60000 / safeBpm);
}

export class LooperViewModel {

    private device: LooperDevice | null = null;
    private countInTimer: ReturnType<typeof setTimeout> | null = null;

    constructor(private store = LooperStateStore, private connection: LooperConnectionSource | null = DeviceStateStore) {
        // Clear transport state (and any pending count-in) as soon as the amp goes away,
        // whatever UI happens to be mounted: the amp's looper is gone with the link, and
        // a count-in timer must not send Record to a reconnected amp.
        this.connection?.subscribe(s => !!s.isConnected, isConnected => {
            if (!isConnected) this.reset();
        });
    }

    private isConnected(): boolean {
        return this.connection ? !!this.connection.getRawState().isConnected : true;
    }

    /** Returns the device, or records a visible error when there is none. */
    private requireDevice(): LooperDevice | null {
        if (!this.device) {
            this.log("No device attached");
            this.update({ lastError: NO_DEVICE_ERROR });
        }
        return this.device;
    }

    private get state(): ILooperState {
        return this.store.getRawState();
    }

    private update(patch: Partial<ILooperState>) {
        this.store.update(s => { Object.assign(s, patch); });
    }

    private log(msg: string) {
        console.debug("[LooperViewModel] " + msg);
    }

    /**
     * Starts listening to the device manager. Looper messages are consumed here and
     * not passed on, so frequent loop position updates do not run the generic
     * device-state-changed path (which re-applies the last preset read from the amp).
     * Everything else is forwarded unchanged. Safe to call more than once.
     */
    attach(device: LooperDevice | null | undefined) {
        if (!device || this.device === device) return;
        this.device = device;

        const previous = device.onStateChanged;
        device.onStateChanged = (deviceState: any) => {
            const message: DeviceMessage = deviceState?.message;
            if (isLooperMessage(message)) {
                this.handleDeviceMessage(message);
                return;
            }
            if (message?.type == "hardware_bpm") {
                this.handleDeviceMessage(message);
            }
            if (previous) previous(deviceState);
        };
    }

    get isAttached(): boolean {
        return this.device != null;
    }

    /** Applies a message from the amp. Returns true if it was a looper related message. */
    handleDeviceMessage(message: DeviceMessage | LooperMessage): boolean {
        if (!message) return false;

        switch (message.type) {
            case "looper_command": {
                const command = (message as any).command as number;
                this.update({ ...applyLooperCommand(this.state, command), lastCommand: command });
                return true;
            }
            case "looper_settings":
                this.update({ settings: (message as any).settings });
                return true;
            case "looper_measure":
                this.update({ measure: (message as any).measure });
                return true;
            case "looper_status": {
                const status = (message as any).status;
                const patch: Partial<ILooperState> = { status, loopCount: status.loopCount };
                // As in Ignitron, a status message can only reveal a loop. What its loop
                // count byte means is not known for sure (Ignitron's sample status has 0),
                // so only Delete or a reset clears hasLoop.
                if (status.loopCount > 0) {
                    patch.hasLoop = true;
                }
                this.update(patch);
                return true;
            }
            case "hardware_bpm": {
                const bpm = (message as BpmMessage).bpm;
                if (Number.isFinite(bpm)) this.update({ ampBpm: bpm });
                return false;
            }
            default:
                return false;
        }
    }

    /** Clears transport state, e.g. after the amp disconnects. Settings are kept. */
    reset() {
        this.cancelCountInTimer();
        const fresh = initialLooperState();
        this.update({ ...fresh, settings: this.state.settings, ampBpm: this.state.ampBpm });
    }

    /** Sends one raw transport command and applies its state change once written. */
    async looperCommand(command: LooperCommand): Promise<boolean> {
        const device = this.requireDevice();
        if (!device) return false;
        try {
            await device.sendLooperCommand(command);
            this.update({ ...applyLooperCommand(this.state, command), lastCommand: command, lastError: null });
            return true;
        } catch (err) {
            this.log("Looper command failed: " + err);
            this.update({ lastError: "Could not send the looper command to the amp." });
            return false;
        }
    }

    /** Asks the amp for its looper settings and status. */
    async refresh(): Promise<boolean> {
        const device = this.requireDevice();
        if (!device) return false;
        try {
            await device.requestLooperState();
            if (this.state.lastError) this.update({ lastError: null });
            return true;
        } catch (err) {
            this.log("Looper state request failed: " + err);
            this.update({ lastError: "Could not read the looper state from the amp." });
            return false;
        }
    }

    async applySettings(changes: Partial<LooperSettings>): Promise<boolean> {
        const device = this.requireDevice();
        if (!device) return false;

        // keep fields the UI does not edit (unknown switch, max duration) as the amp sent them
        const merged = normaliseLooperSettings({ ...(this.state.settings ?? DEFAULT_LOOPER_SETTINGS), ...changes });
        if (merged.free) {
            // what Ignitron sends for a free length loop
            merged.bars = Math.floor(merged.bpm / 4);
        }

        try {
            await device.updateLooperSettings(merged);
            this.update({ settings: merged, lastError: null });
            return true;
        } catch (err) {
            this.log("Looper settings update failed: " + err);
            this.update({ lastError: "Could not send the looper settings to the amp." });
            return false;
        }
    }

    async performLooperAction(action: LooperActionId): Promise<boolean> {
        switch (action) {
            case "rec-dub": return this.recDub();
            case "play-stop": return this.playStop();
            case "undo-redo": return this.undoRedo();
            case "delete": return this.deleteLoop();
            case "retry": return this.retry();
            default: return false;
        }
    }

    async recDub(): Promise<boolean> {
        const s = this.state;
        if (s.isCountingIn) {
            return this.cancelCountIn();
        }
        if (!s.hasLoop && !s.isRecording) {
            return this.record();
        }
        if (!s.hasLoop && s.isRecording) {
            // first loop: close it and play it back
            const ok = await this.stopRecording();
            return ok && (this.state.isPlaying || await this.looperCommand(LooperCommand.Play));
        }
        if (s.hasLoop && !s.isRecording) {
            const ok = await this.looperCommand(LooperCommand.Dub);
            return ok && await this.looperCommand(LooperCommand.Play);
        }
        return this.stopRecording();
    }

    async playStop(): Promise<boolean> {
        const s = this.state;
        if (s.isCountingIn) {
            return this.cancelCountIn();
        }
        if (s.isRecording) {
            const ok = await this.looperCommand(LooperCommand.Stop);
            return (await this.stopRecording()) && ok;
        }
        if (s.isPlaying) {
            const ok = await this.looperCommand(LooperCommand.Stop);
            await this.refresh();
            return ok;
        }
        return this.looperCommand(LooperCommand.Play);
    }

    async undoRedo(): Promise<boolean> {
        if (this.state.canRedo) return this.looperCommand(LooperCommand.Redo);
        if (this.state.hasLoop) return this.looperCommand(LooperCommand.Undo);
        return false;
    }

    async deleteLoop(): Promise<boolean> {
        this.cancelCountInTimer();
        return this.looperCommand(LooperCommand.Delete);
    }

    async retry(): Promise<boolean> {
        this.cancelCountInTimer();
        const ok = await this.looperCommand(LooperCommand.Retry);
        return ok && await this.record();
    }

    // Starts recording, with a one bar count-in first when the click is enabled.
    // Like Ignitron, the app times the count-in bar and then sends Record itself.
    private async record(): Promise<boolean> {
        const settings = this.state.settings ?? DEFAULT_LOOPER_SETTINGS;
        if (!settings.click) {
            return this.looperCommand(LooperCommand.Record);
        }

        if (!await this.looperCommand(LooperCommand.CountIn)) return false;

        this.cancelCountInTimer();
        this.countInTimer = setTimeout(() => {
            this.countInTimer = null;
            if (this.state.isCountingIn && this.device && this.isConnected()) {
                void this.looperCommand(LooperCommand.Record);
            }
        }, countInDurationMs(settings.bpm));
        return true;
    }

    private async stopRecording(): Promise<boolean> {
        let ok: boolean;
        if (this.state.hasLoop) {
            ok = await this.looperCommand(LooperCommand.StopDub);
        } else {
            ok = await this.looperCommand(LooperCommand.StopRecord);
            ok = (await this.looperCommand(LooperCommand.RecordComplete)) && ok;
        }
        await this.refresh();
        return ok;
    }

    private async cancelCountIn(): Promise<boolean> {
        this.cancelCountInTimer();
        this.update({ isCountingIn: false });
        return this.looperCommand(LooperCommand.Stop);
    }

    private cancelCountInTimer() {
        if (this.countInTimer) {
            clearTimeout(this.countInTimer);
            this.countInTimer = null;
        }
    }
}

export const looperViewModel = new LooperViewModel();

export default looperViewModel;
