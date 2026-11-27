import { DeviceMessage } from "../spork/src/interfaces/preset";
import {
    clampMixerValue,
    isValidMixerChannel,
    MIXER_CHANNEL,
    MIXER_MESSAGE_ACK,
    MIXER_MESSAGE_INPUT_VOLUME,
    MIXER_MESSAGE_VOLUME,
    MixerVolumeMessage,
} from "../spork/src/interfaces/mixer";
import { DeviceStateStore } from "../stores/devicestate";
import { IMixerChannelState, IMixerState, initialMixerChannelState, initialMixerState, MixerStateStore } from "../stores/mixerstate";
import { platformEvents } from "./platformUtils";

// ---------------------------------------------------------------------------
// Experimental amp mixer (Guitar / Music / Master volume)
//
// HARDWARE EXPERIMENT. The 0x01 0x33 / 0x02 0x33 messages are documented for the
// Spark LIVE only (paulhamsh/SparkBox) and reported to work on a Spark GO; on a
// Spark 2 the GUITAR and MUSIC knobs may well be analog and ignore them.
//
// SAFETY: nothing here ever sends a mixer value on its own. Not on connect, not
// on a channel switch, not from saved settings (values are not persisted). Only
// setVolume(), called from an explicit user action, writes to the amp. Reads
// (0x02 0x33) are harmless and may be done when the panel opens.
//
// Read replies (0x03 0x33) do not say which channel they are for, so reads are
// done one at a time and a reply belongs to the oldest outstanding request. After
// a request times out its reply may still come in late, so the next request waits
// MIXER_READ_SETTLE_MS, a channel-less reply that arrives before the next request
// was even written is dropped, and any later reply in that pass is marked
// readUncertain (the panel says it may be a late reply).
//
// A read reply never overwrites a value the user set after the request went out
// (or is still sending): the amp answered with what it had before the set.
// ---------------------------------------------------------------------------

export interface MixerChannelInfo {
    channel: number;
    label: string;
}

/** The channels the panel shows sliders for, in order. */
export const MIXER_CHANNELS: ReadonlyArray<MixerChannelInfo> = [
    { channel: MIXER_CHANNEL.GUITAR, label: "Guitar" },
    { channel: MIXER_CHANNEL.MUSIC, label: "Music" },
    { channel: MIXER_CHANNEL.MASTER, label: "Master" },
];

export const MIXER_READ_CHANNELS: ReadonlyArray<number> = MIXER_CHANNELS.map(c => c.channel);

/** How long to wait for a 0x03 0x33 reply before giving up on a channel. */
export const MIXER_READ_TIMEOUT_MS = 1500;

/** After a read timed out, how long to wait (ignoring stray replies) before the next request. */
export const MIXER_READ_SETTLE_MS = 750;

/** Channels the panel's "custom channel" probe may use (the Spark LIVE goes up to 9). */
export const MIXER_PROBE_MAX_CHANNEL = 15;

const NOT_CONNECTED_ERROR = "Connect an amp to use the mixer.";

/** 0..1 to a whole percentage, null when unknown. */
export function mixerValueToPercent(value: number | null | undefined): number | null {
    if (value == null || !Number.isFinite(value)) return null;
    return Math.round(Math.min(1, Math.max(0, value)) * 100);
}

/** e.g. "42 %", or "—" when the value is unknown. */
export function formatMixerValue(value: number | null | undefined): string {
    const percent = mixerValueToPercent(value);
    return percent == null ? "—" : `${percent} %`;
}

/** Whether a set will carry the trailing 0x00, given the setting and the connected model. */
export function effectiveTrailingZero(trailingZero: boolean | null, isSpark2: boolean): boolean {
    return trailingZero ?? isSpark2;
}

export interface MixerEvents {
    on(type: string, action: (event: any, args: any) => any): void;
    invoke(type: string, data: any): Promise<any>;
}

interface OutstandingRead {
    channel: number;
    resolve: (value: number | null) => void;
    timer: ReturnType<typeof setTimeout> | null;
    /** The write of the 0x02 0x33 request has resolved. */
    written: boolean;
    /** The channel's set count when the request was made (see setCounts). */
    setCount: number;
}

export class MixerViewModel {

    // At most one set per channel is in flight and at most one more waits (only the
    // latest value), like DeviceViewModel.requestFxParamChange, so a slider drag never
    // builds a backlog on a BLE link that delivers about two commands a second.
    private sends = new Map<number, { pending: number | null }>();

    // Read requests waiting for their 0x03 0x33 reply, oldest first.
    private outstanding: OutstandingRead[] = [];

    // Number of setVolume() calls per channel, so a read reply can tell whether the
    // user set the channel after its request went out.
    private setCounts = new Map<number, number>();

    // A read in the current pass timed out, so its reply may still arrive late.
    private lateReplyPossible = false;

    // Bumped by reset() so work started before a disconnect stops touching the store.
    private generation = 0;

    private unsubscribeConnection: () => void;

    constructor(private events: MixerEvents = platformEvents, private now: () => number = () => Date.now()) {
        // DeviceContext forwards mixer replies, acks and input volume notifications
        // under their own event.
        this.events.on("mixer-message", (_event, msg: DeviceMessage) => this.handleMessage(msg));

        // Forget everything when the amp goes away (another amp may connect next).
        // Connecting does nothing: no value is ever sent automatically.
        this.unsubscribeConnection = DeviceStateStore.subscribe(
            s => s.isConnected,
            connected => { if (!connected) this.reset(); });
    }

    /** Stops following the connection state (used by tests). */
    dispose() {
        this.unsubscribeConnection?.();
        this.generation++;
        this.sends.clear();
        this.setCounts.clear();
        this.cancelReads();
    }

    private get state(): IMixerState {
        return MixerStateStore.getRawState();
    }

    private isConnected(): boolean {
        return !!DeviceStateStore.getRawState().isConnected;
    }

    private update(patch: Partial<IMixerState>) {
        MixerStateStore.update(s => { Object.assign(s, patch); });
    }

    private patchChannel(channel: number, patch: Partial<IMixerChannelState>) {
        MixerStateStore.update(s => {
            s.channels[channel] = { ...(s.channels[channel] ?? initialMixerChannelState()), ...patch };
        });
    }

    private log(msg: string) {
        console.debug("[MixerViewModel] " + msg);
    }

    /** Applies a mixer message received from the amp. */
    handleMessage(msg: DeviceMessage) {
        switch (msg?.type) {
            case MIXER_MESSAGE_VOLUME:
                this.handleReadReply(<MixerVolumeMessage>msg);
                break;
            case MIXER_MESSAGE_INPUT_VOLUME: {
                const value = msg.value;
                if (typeof value != "number" || !Number.isFinite(value)) return;
                this.update({ lastInputVolume: value, lastInputVolumeAt: this.now() });
                // The amp reports its real guitar input volume. Show it, unless the user
                // is busy changing that slider (a send is in flight or waiting).
                if (!this.sends.has(MIXER_CHANNEL.GUITAR)) {
                    this.patchChannel(MIXER_CHANNEL.GUITAR, { value: clampMixerValue(value) });
                }
                break;
            }
            case MIXER_MESSAGE_ACK:
                this.update({ ackCount: this.state.ackCount + 1, lastAckAt: this.now() });
                break;
        }
    }

    private handleReadReply(msg: MixerVolumeMessage) {
        const value = msg.value;
        if (typeof value != "number" || !Number.isFinite(value)) return;

        // Normally the reply has no channel and belongs to the oldest request. If the
        // amp did name a channel, trust it.
        const index = msg.channel != null
            ? this.outstanding.findIndex(r => r.channel == msg.channel)
            : 0;
        const request = index >= 0 ? this.outstanding[index] : undefined;
        const channel = msg.channel ?? request?.channel;

        if (channel == null) {
            this.log("Mixer volume reply with no read outstanding, ignoring");
            return;
        }

        const unnamed = msg.channel == null;
        if (unnamed && request && !request.written && this.lateReplyPossible) {
            // The oldest request is not even on the wire yet and an earlier one timed
            // out: this is that earlier request's late reply, not this one's.
            this.log(`Mixer volume reply before the channel ${channel} request was sent, after a timeout: ignoring it as a late reply`);
            return;
        }

        // The amp answered with what it had when the request arrived. If the user set
        // this channel since (or a set is still going out), keep the user's value.
        const userSetSince = this.sends.has(channel)
            || (request != null && (this.setCounts.get(channel) ?? 0) != request.setCount);

        const patch: Partial<IMixerChannelState> = {
            lastReadValue: value,
            lastReadAt: this.now(),
            readStatus: "ok",
            readUncertain: unnamed && this.lateReplyPossible,
        };
        if (!userSetSince) patch.value = clampMixerValue(value);
        this.patchChannel(channel, patch);

        if (request) {
            this.outstanding.splice(index, 1);
            if (request.timer) clearTimeout(request.timer);
            request.resolve(value);
        }
    }

    /**
     * Sets a channel's volume (0..1, clamped). Only call this from a user action.
     * Coalesced per channel: resolves with the result of the send it started, or true
     * straight away when the value was queued behind a send already in flight.
     */
    async setVolume(channel: number, value: number): Promise<boolean> {
        if (!isValidMixerChannel(channel) || typeof value != "number" || !Number.isFinite(value)) {
            this.update({ lastError: `Invalid mixer channel or value (${channel}, ${value}).` });
            return false;
        }
        if (!this.isConnected()) {
            this.update({ lastError: NOT_CONNECTED_ERROR });
            return false;
        }

        const clamped = clampMixerValue(value);
        this.setCounts.set(channel, (this.setCounts.get(channel) ?? 0) + 1);
        this.patchChannel(channel, { value: clamped });

        const inFlight = this.sends.get(channel);
        if (inFlight) {
            // keep only the latest value; it is sent when the current send settles
            inFlight.pending = clamped;
            return true;
        }

        return this.sendNow(channel, clamped);
    }

    private async sendNow(channel: number, value: number): Promise<boolean> {
        const generation = this.generation;
        const entry = { pending: null as number | null };
        this.sends.set(channel, entry);

        let ok = false;
        try {
            ok = (await this.events.invoke("perform-action", {
                action: "setMixerVolume",
                data: { channel, value, trailingZero: this.state.trailingZero },
            })) !== false;
        } catch {
            ok = false;
        }

        // reset() (a disconnect) ran meanwhile: drop the rest of the drag
        if (generation != this.generation) return ok;

        if (ok) {
            this.patchChannel(channel, { lastSentValue: value, lastSentAt: this.now() });
            if (this.state.lastError) this.update({ lastError: null });
        } else {
            this.update({ lastError: "Could not send the mixer volume to the amp. Check the amp connection and try again." });
        }

        this.sends.delete(channel);
        if (entry.pending != null && this.isConnected()) {
            void this.sendNow(channel, entry.pending);
        }
        return ok;
    }

    /**
     * Asks the amp for each channel's volume, one at a time. A channel whose reply does
     * not arrive within MIXER_READ_TIMEOUT_MS is marked "no-reply". Resolves true if at
     * least one channel answered. Read-only, so it is safe to call when the panel opens.
     */
    async readMixer(channels: ReadonlyArray<number> = MIXER_READ_CHANNELS): Promise<boolean> {
        if (!this.isConnected()) {
            this.update({ lastError: NOT_CONNECTED_ERROR });
            return false;
        }
        if (this.state.isReading) return false;

        const generation = this.generation;
        const valid = channels.filter(isValidMixerChannel);

        this.lateReplyPossible = false;
        MixerStateStore.update(s => {
            s.isReading = true;
            s.lastError = null;
            for (const ch of valid) {
                s.channels[ch] = { ...(s.channels[ch] ?? initialMixerChannelState()), readStatus: "pending", readUncertain: false };
            }
        });

        let answered = 0;
        let writeFailed = false;
        for (let i = 0; i < valid.length; i++) {
            if (generation != this.generation || !this.isConnected()) break;
            const result = await this.readChannel(valid[i]);
            if (generation != this.generation) break;
            if (result === "written-failed") writeFailed = true;
            else if (result != null) answered++;
            else if (i < valid.length - 1) {
                // Timed out: let a late reply come in (and be ignored, nothing is
                // outstanding) before asking for the next channel.
                await new Promise(resolve => setTimeout(resolve, MIXER_READ_SETTLE_MS));
            }
        }

        if (generation == this.generation) {
            this.update({
                isReading: false,
                lastError: writeFailed ? "Could not send the mixer read request to the amp." : this.state.lastError,
            });
        }
        return answered > 0;
    }

    private async readChannel(channel: number): Promise<number | null | "written-failed"> {
        const generation = this.generation;
        let request: OutstandingRead;
        // Registered before the write, so a reply that beats the write's promise still counts.
        const reply = new Promise<number | null>(resolve => {
            request = { channel, resolve, timer: null, written: false, setCount: this.setCounts.get(channel) ?? 0 };
            this.outstanding.push(request);
        });

        let written = false;
        try {
            written = (await this.events.invoke("perform-action", { action: "getMixerVolume", data: channel })) !== false;
        } catch {
            written = false;
        }

        if (generation != this.generation) return null;

        if (!written) {
            this.removeRequest(request);
            this.patchChannel(channel, { readStatus: "error" });
            return "written-failed";
        }

        request.written = true;
        if (this.outstanding.includes(request)) {
            // The timeout starts once the request is on the wire: it may have waited
            // behind other commands (e.g. a Spark 2 preset upload) before that.
            request.timer = setTimeout(() => {
                request.timer = null;
                if (!this.removeRequest(request)) return;
                this.lateReplyPossible = true;
                this.log(`No reply for mixer channel ${channel}`);
                this.patchChannel(channel, { readStatus: "no-reply" });
                request.resolve(null);
            }, MIXER_READ_TIMEOUT_MS);
        }

        return reply;
    }

    private removeRequest(request: OutstandingRead): boolean {
        const index = this.outstanding.indexOf(request);
        if (index < 0) return false;
        this.outstanding.splice(index, 1);
        if (request.timer) clearTimeout(request.timer);
        return true;
    }

    private cancelReads() {
        const pending = this.outstanding;
        this.outstanding = [];
        this.lateReplyPossible = false;
        for (const r of pending) {
            if (r.timer) clearTimeout(r.timer);
            r.resolve(null);
        }
    }

    /** true / false forces the trailing 0x00 on or off; null follows the model (on for a Spark 2). */
    setTrailingZero(trailingZero: boolean | null) {
        this.update({ trailingZero });
    }

    /** Whether a set for this channel is in flight or waiting. */
    isSending(channel: number): boolean {
        return this.sends.has(channel);
    }

    /**
     * Forgets all mixer values, e.g. when the amp disconnects. The tester's explicit
     * trailing 0x00 choice is a session setting, not a mixer value, so it is kept
     * (an auto-reconnect must not bring back a frame format they ruled out).
     */
    reset() {
        this.generation++;
        this.sends.clear();
        this.setCounts.clear();
        this.cancelReads();
        MixerStateStore.update(s => Object.assign(s, { ...initialMixerState(), trailingZero: s.trailingZero }));
    }
}

let sharedMixerViewModel: MixerViewModel | null = null;

/** The app-wide mixer view model, created (and subscribed to amp messages) on first use. */
export function getMixerViewModel(): MixerViewModel {
    if (sharedMixerViewModel == null) {
        sharedMixerViewModel = new MixerViewModel();
    }
    return sharedMixerViewModel;
}
