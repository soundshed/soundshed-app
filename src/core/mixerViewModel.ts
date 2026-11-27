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
// Amp mixer (Guitar / Music volume and mute), shown as knobs in the nav bar and as
// sliders in the amp screen's diagnostics drawer.
//
// EXPERIMENTAL. The 0x01 0x33 / 0x02 0x33 messages are documented for the Spark
// LIVE (paulhamsh/SparkBox). A user's hardware test confirmed Guitar (channel 0)
// and Music (channel 5) on a Spark 2; other models are untested. Master (9) is no
// longer a standard channel, the drawer's custom channel can still probe it.
//
// SAFETY: nothing here ever sends a mixer value on its own. Not on connect, not
// on a channel switch, not from saved settings (values are not persisted). Only
// setVolume(), setMuted() and toggleMute(), called from an explicit user action (a
// control in the app, or incoming MIDI through a mixer-volume / mixer-mute
// mapping), write to the amp. Reads (0x02 0x33) are harmless: Guitar and Music are read once when an amp
// connects, and again when the drawer opens.
//
// MUTE: the amp has no mute command, so muting sends 0 and remembers the level to
// go back to. A mute is kept across a disconnect and reconnect of the same amp (by
// address) in this session, and dropped when the amp reports a level again. If the
// send that carried a mute or unmute fails, the mute is undone in the store (and the
// channel is flagged sendFailed), so the controls never show a mute the amp lacks.
//
// Read replies (0x03 0x33) do not say which channel they are for, so reads are
// done one at a time and a reply belongs to the oldest outstanding request. After
// a request times out its reply may still come in late, so the next request waits
// MIXER_READ_SETTLE_MS, a channel-less reply that arrives before the next request
// was even written is dropped, and any later reply in that pass is marked
// readUncertain (the panel says it may be a late reply). An uncertain reply never
// ends a mute: it may be another channel's level.
//
// A read reply never overwrites a value the user set after the request went out
// (or is still sending): the amp answered with what it had before the set.
// ---------------------------------------------------------------------------

export interface MixerChannelInfo {
    channel: number;
    label: string;
}

/** The channels the nav-bar knobs and the drawer's sliders control, in order. */
export const MIXER_CHANNELS: ReadonlyArray<MixerChannelInfo> = [
    { channel: MIXER_CHANNEL.GUITAR, label: "Guitar" },
    { channel: MIXER_CHANNEL.MUSIC, label: "Music" },
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

export interface MixerViewModelOptions {
    /** Read the standard channels when an amp connects (default true). */
    readOnConnect?: boolean;
}

/** Mutes kept over a disconnect: channel -> level to restore, for the amp they were made on. */
interface HeldMutes {
    address: string;
    channels: Map<number, number | null>;
}

export interface MixerEvents {
    on(type: string, action: (event: any, args: any) => any): void;
    invoke(type: string, data: any): Promise<any>;
}

/** A channel's level and mute, as the store shows it (see SendEntry.base). */
interface ChannelLevel {
    value: number | null;
    muted: boolean;
    unmuteValue: number | null;
}

/** The set in flight for a channel. */
interface SendEntry {
    /** The latest value queued behind it, with the store's level right after it was queued. */
    pending: { value: number; after: ChannelLevel } | null;
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
    private sends = new Map<number, SendEntry>();

    // Read requests waiting for their 0x03 0x33 reply, oldest first.
    private outstanding: OutstandingRead[] = [];

    // Number of setVolume() calls per channel, so a read reply can tell whether the
    // user set the channel after its request went out.
    private setCounts = new Map<number, number>();

    // A read in the current pass timed out, so its reply may still arrive late.
    private lateReplyPossible = false;

    // Bumped by reset() so work started before a disconnect stops touching the store.
    private generation = 0;

    // Address of the connected amp, and the mutes held over a disconnect.
    private connectedAddress: string | null = null;
    private heldMutes: HeldMutes | null = null;

    private unsubscribeConnection: () => void;

    constructor(
        private events: MixerEvents = platformEvents,
        private now: () => number = () => Date.now(),
        private options: MixerViewModelOptions = {},
    ) {
        // DeviceContext forwards mixer replies, acks and input volume notifications
        // under their own event.
        this.events.on("mixer-message", (_event, msg: DeviceMessage) => this.handleMessage(msg));

        if (this.isConnected()) this.connectedAddress = this.deviceAddress();

        // Connecting reads Guitar and Music (never sends a value); disconnecting
        // forgets everything except the mutes (another amp may connect next).
        this.unsubscribeConnection = DeviceStateStore.subscribe(
            s => s.isConnected,
            connected => { if (connected) this.onConnected(); else this.onDisconnected(); });
    }

    /** Stops following the connection state (used by tests). */
    dispose() {
        this.unsubscribeConnection?.();
        this.generation++;
        this.sends.clear();
        this.setCounts.clear();
        this.heldMutes = null;
        this.cancelReads();
    }

    private get state(): IMixerState {
        return MixerStateStore.getRawState();
    }

    private isConnected(): boolean {
        return !!DeviceStateStore.getRawState().isConnected;
    }

    private deviceAddress(): string | null {
        return DeviceStateStore.getRawState().connectedDevice?.address ?? null;
    }

    private onConnected() {
        const address = this.deviceAddress();
        const held = this.heldMutes;
        this.heldMutes = null;
        this.connectedAddress = address;

        // The same amp again (e.g. a BLE drop and auto-reconnect): it is still at 0
        // unless the read below finds a level (turned up on the amp meanwhile). Any
        // other amp, or one we can't tell apart, starts unmuted.
        if (held && address != null && held.address == address) {
            MixerStateStore.update(s => {
                for (const [channel, unmuteValue] of held.channels) {
                    s.channels[channel] = { ...(s.channels[channel] ?? initialMixerChannelState()), muted: true, unmuteValue };
                }
            });
        }

        // Read only, so the knobs show the amp's real levels.
        if (this.options.readOnConnect !== false) void this.readMixer();
    }

    private onDisconnected() {
        const channels = new Map<number, number | null>();
        for (const [key, ch] of Object.entries(this.state.channels)) {
            if (ch?.muted) channels.set(Number(key), ch.unmuteValue ?? null);
        }
        this.heldMutes = channels.size > 0 && this.connectedAddress != null
            ? { address: this.connectedAddress, channels }
            : null;
        this.connectedAddress = null;
        this.reset();
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
                // is busy changing that slider (a send is in flight or waiting). A level
                // above 0 on a muted guitar means it was turned up on the amp: unmuted.
                if (!this.sends.has(MIXER_CHANNEL.GUITAR)) {
                    const level = clampMixerValue(value);
                    this.patchChannel(MIXER_CHANNEL.GUITAR, { value: level, ...this.unmutedBy(MIXER_CHANNEL.GUITAR, level) });
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
        // An uncertain reply may be another channel's (a timed-out read's late answer),
        // so it must not end a mute or replace the 0 a muted channel was set to.
        const uncertain = !!patch.readUncertain;
        const muted = !!this.state.channels[channel]?.muted;
        if (!userSetSince && !(uncertain && muted)) {
            patch.value = clampMixerValue(value);
            Object.assign(patch, this.unmutedBy(channel, patch.value));
        }
        this.patchChannel(channel, patch);

        if (request) {
            this.outstanding.splice(index, 1);
            if (request.timer) clearTimeout(request.timer);
            request.resolve(value);
        }
    }

    /** The patch that clears a channel's mute when the amp reports a level above 0. */
    private unmutedBy(channel: number, level: number): Partial<IMixerChannelState> {
        return this.state.channels[channel]?.muted && level > 0 ? { muted: false, unmuteValue: null } : {};
    }

    /**
     * Sets a channel's volume (0..1, clamped). Only call this from a user action.
     * Unmutes the channel. Coalesced per channel: resolves with the result of the send
     * it started, or true straight away when the value was queued behind a send
     * already in flight.
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

        // Turning a muted channel's knob or slider unmutes it at the new level.
        const unmute = this.state.channels[channel]?.muted ? { muted: false, unmuteValue: null } : {};
        return this.queueSend(channel, clampMixerValue(value), unmute);
    }

    /** Mutes a channel, or unmutes a muted one. Only call this from a user action (see setMuted). */
    async toggleMute(channel: number): Promise<boolean> {
        return this.setMuted(channel, !this.state.channels[channel]?.muted);
    }

    /**
     * Mutes or unmutes a channel. Only call this from a user action. Muting sends 0 and
     * remembers the known level (if above 0); unmuting sends that level back, or only
     * clears the mute when there is none, leaving the level at 0 rather than guessing.
     * Idempotent: a channel already in that state sends nothing and resolves true.
     */
    async setMuted(channel: number, muted: boolean): Promise<boolean> {
        if (!isValidMixerChannel(channel)) {
            this.update({ lastError: `Invalid mixer channel (${channel}).` });
            return false;
        }
        if (!this.isConnected()) {
            this.update({ lastError: NOT_CONNECTED_ERROR });
            return false;
        }

        const ch = this.state.channels[channel];
        if (!!ch?.muted == muted) return true;
        if (muted) {
            const level = ch?.value;
            return this.queueSend(channel, 0, { muted: true, unmuteValue: level != null && level > 0 ? level : null });
        }
        if (ch.unmuteValue == null) {
            this.patchChannel(channel, { muted: false, unmuteValue: null });
            return true;
        }
        return this.queueSend(channel, ch.unmuteValue, { muted: false, unmuteValue: null });
    }

    private channelLevel(channel: number): ChannelLevel {
        const ch = this.state.channels[channel];
        return { value: ch?.value ?? null, muted: !!ch?.muted, unmuteValue: ch?.unmuteValue ?? null };
    }

    private queueSend(channel: number, value: number, patch: Partial<IMixerChannelState>): Promise<boolean> | boolean {
        const before = this.channelLevel(channel);
        this.setCounts.set(channel, (this.setCounts.get(channel) ?? 0) + 1);
        this.patchChannel(channel, { ...patch, value });
        const after = this.channelLevel(channel);

        const inFlight = this.sends.get(channel);
        if (inFlight) {
            // keep only the latest value; it is sent when the current send settles
            inFlight.pending = { value, after };
            return true;
        }

        return this.sendNow(channel, value, after, before);
    }

    /**
     * Writes one value. `after` is the level the store showed once it was queued, `base`
     * the level the amp is known to have (the store before the first of this run of
     * sends). If the run ends with a failed send, a mute or unmute it carried is undone,
     * so the controls never show muted while the amp still plays (or the reverse).
     */
    private async sendNow(channel: number, value: number, after: ChannelLevel, base: ChannelLevel): Promise<boolean> {
        const generation = this.generation;
        const entry: SendEntry = { pending: null };
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
            base = after;
            this.patchChannel(channel, { lastSentValue: value, lastSentAt: this.now(), sendFailed: false });
            if (this.state.lastError) this.update({ lastError: null });
        } else {
            this.patchChannel(channel, { sendFailed: true });
            this.update({ lastError: "Could not send the mixer volume to the amp. Check the amp connection and try again." });
        }

        this.sends.delete(channel);
        const next = entry.pending;
        if (next != null && this.isConnected()) {
            void this.sendNow(channel, next.value, next.after, base);
        } else if (!ok) {
            this.rollBackMute(channel, base);
        }
        return ok;
    }

    /** After a failed send: if the store's mute differs from what the amp has, go back to the amp's. */
    private rollBackMute(channel: number, base: ChannelLevel) {
        if (this.channelLevel(channel).muted == base.muted) return;
        this.log(`Mixer channel ${channel}: the ${base.muted ? "unmute" : "mute"} was not sent, undoing it`);
        this.patchChannel(channel, { value: base.value, muted: base.muted, unmuteValue: base.unmuteValue });
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
     * Forgets all mixer values, e.g. when the amp disconnects (the mutes to restore on
     * a reconnect were set aside before). The tester's explicit trailing 0x00 choice is
     * a session setting, not a mixer value, so it is kept (an auto-reconnect must not
     * bring back a frame format they ruled out).
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

/**
 * The app-wide mixer view model, created (and subscribed to amp messages and the
 * connection state) on first use. app.tsx creates it at startup, so connect reads,
 * acks and 0x03 0x6b notifications are handled whichever page is open.
 */
export function getMixerViewModel(): MixerViewModel {
    if (sharedMixerViewModel == null) {
        sharedMixerViewModel = new MixerViewModel();
    }
    return sharedMixerViewModel;
}
