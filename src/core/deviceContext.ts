
import { SparkDeviceManager } from "../spork/src/devices/spark/sparkDeviceManager";
import { SerialCommsProvider } from "../spork/src/interfaces/serialCommsProvider";
import { VIRTUAL_CHANNEL } from "./sparkChannels";

export class DeviceContext {

    deviceManager: SparkDeviceManager;
    msgSendDelegate: (type: string, msg: any) => void;

    // Monotonic token; bumped on user-initiated scan/connect so a stale auto-reconnect
    // attempt can detect it's been superseded and bail without clobbering UI state.
    private reconnectGeneration = 0;

    // The channel the amp is currently sitting on, as far as we know. Applied tones go
    // to the virtual channel 0x7f rather than a hardware slot, so a reconnect has to
    // re-read that channel — reading slot 0 would show a completely different tone.
    private lastSelectedChannel = 0;

    private log(msg: string) {
        console.debug(msg);
    }

    public init(commsProvider: SerialCommsProvider, msgDelegate: (type: string, msg: any) => void) {

        this.log("DeviceContext: Init");

        this.deviceManager = new SparkDeviceManager(commsProvider);

        this.deviceManager.onStateChanged = (s: any) => {
            this.log("DeviceContext: device state changed")
            this.sendMessageToApp('device-state-changed', s);
        };

        this.deviceManager.onConnectionLost = () => {
            this.log("DeviceContext: device connection lost");
            this.sendMessageToApp('device-connection-changed', 'disconnected');
            void this.attemptReconnect();
        };

        this.msgSendDelegate = msgDelegate;
    }

    private async attemptReconnect(): Promise<void> {
        const myGen = ++this.reconnectGeneration;
        this.sendMessageToApp('device-connection-changed', 'reconnecting');

        // Brief settle delay before retrying gatt.connect().
        await new Promise(resolve => setTimeout(resolve, 1500));
        if (this.reconnectGeneration !== myGen) return;

        const ok = await this.deviceManager.reconnect().catch(() => false);
        if (this.reconnectGeneration !== myGen) return;

        if (ok) {
            this.log("DeviceContext: reconnect succeeded");
            this.sendMessageToApp('device-connection-changed', 'connected');
            await this.deviceManager.sendCommand("get_preset", this.lastSelectedChannel)
                .catch(err => this.log("DeviceContext: post-reconnect get_preset failed: " + err));
        } else {
            this.log("DeviceContext: reconnect attempt failed");
            this.sendMessageToApp('device-connection-changed', 'failed');
        }
    }

    private sendMessageToApp(type: string, args: any) {
        if (this.msgSendDelegate) {
            this.msgSendDelegate(type, args);
        } else {
            this.log("Cannot send message, no delegate provided");
        }
    }

    public performAction(args: any) {
        // ... do actions on behalf of the Renderer
        this.log("got event from render:" + args.action);

        if (args.action == 'scan') {
            // User scan supersedes any in-flight auto-reconnect.
            this.reconnectGeneration++;
            return this.deviceManager.scanForDevices().then((devices) => {
                this.log(JSON.stringify(devices));

                this.sendMessageToApp('devices-discovered', devices);
            });
        }

        if (args.action == 'connect') {
            this.log("attempting to connect:: " + JSON.stringify(args));

            // User connect supersedes any in-flight auto-reconnect.
            this.reconnectGeneration++;

            try {
                return this.deviceManager.connect(args.data).then(connectedOk => {
                    if (connectedOk) {
                        this.sendMessageToApp("device-connection-changed", "connected")

                        this.lastSelectedChannel = 0;
                        this.deviceManager.sendCommand("get_preset", 0);

                    } else {
                        this.sendMessageToApp("device-connection-changed", "failed")
                    }

                    return connectedOk;
                }).catch(err => {
                    this.sendMessageToApp("device-connection-changed", "failed")
                });

            } catch (e) {
                this.sendMessageToApp("device-connection-changed", "failed")
            }
        }

        if (args.action == 'applyPreset') {
            return this.applyPreset(args.data);
        }

        if (args.action == 'getCurrentChannel') {
            return this.deviceManager.sendCommand("get_selected_channel", {});
        }

        if (args.action == 'getDeviceName') {
            return this.deviceManager.sendCommand("get_device_name", {});
        }

        if (args.action == 'getDeviceSerial') {
            return this.deviceManager.sendCommand("get_device_serial", {});
        }

        if (args.action == 'getPreset') {
            let ch = 0;
            if (args.data >= 0) {
                ch = args.data;
            }
            this.lastSelectedChannel = ch;
            return this.deviceManager.sendCommand("get_preset", ch);
        }

        if (args.action == 'setChannel') {
            this.lastSelectedChannel = args.data;
            return this.deviceManager.sendCommand("set_channel", args.data);
        }

        if (args.action == 'setFxParam') {
            return this.deviceManager.sendCommand("set_fx_param", args.data);
        }

        if (args.action == 'setFxToggle') {
            return this.deviceManager.sendCommand("set_fx_onoff", args.data);
        }

        if (args.action == 'changeFx') {
            return this.deviceManager.sendCommand("change_fx", args.data);
        }

        if (args.action == 'changeAmp') {
            return this.deviceManager.sendCommand("change_amp", args.data);
        }

        if (args.action == 'storePreset') {

            // send current preset with preset and channel num we want to store to
            return this.deviceManager.sendCommand("set_preset_from_model", args.data);

        }

    }

    // Uploads a tone and switches the amp to the virtual channel it was written to.
    //
    // The caller must be able to await this. When it was fire-and-forget the tone
    // chooser would fire a follow-up get_preset on a fixed 2s timer, which on a
    // Spark 2 lands in the middle of the chunked upload (each chunk waits up to 3s
    // for its ack) and knocks the BLE link over.
    private async applyPreset(preset: any): Promise<boolean> {
        try {
            await this.deviceManager.sendCommand("set_preset_from_model", preset);

            const channelSwitchDelayMs = this.deviceManager.isSpark2Device() ? 500 : 100;
            await new Promise(resolve => setTimeout(resolve, channelSwitchDelayMs));

            // apply preset to the virtual channel rather than a hardware slot
            this.lastSelectedChannel = VIRTUAL_CHANNEL;
            await this.deviceManager.sendCommand("set_channel", VIRTUAL_CHANNEL);

            if (this.deviceManager.isSpark2Device()) {
                await this.deviceManager.sendCommand("request_live_sync", {});
            }

            return true;
        } catch (err) {
            this.log("DeviceContext: applyPreset failed: " + err);
            return false;
        }
    }
}
