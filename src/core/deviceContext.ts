
import { SparkDeviceManager } from "../spork/src/devices/spark/sparkDeviceManager";
import { SerialCommsProvider } from "../spork/src/interfaces/serialCommsProvider";

export class DeviceContext {

    deviceManager: SparkDeviceManager;
    msgSendDelegate: (type: string, msg: any) => void;

    // Monotonic token; bumped on user-initiated scan/connect so a stale auto-reconnect
    // attempt can detect it's been superseded and bail without clobbering UI state.
    private reconnectGeneration = 0;

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
            await this.deviceManager.sendCommand("get_preset", 0)
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
            this.deviceManager.scanForDevices().then((devices) => {
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

            // send preset
            this.deviceManager.sendCommand("set_preset_from_model", args.data).then(async () => {
                const channelSwitchDelayMs = this.deviceManager.isSpark2Device() ? 500 : 100;
                await new Promise(resolve => setTimeout(resolve, channelSwitchDelayMs));

                // apply preset to virtual channel 127 (0x7f)
                await this.deviceManager.sendCommand("set_channel", 0x7f);

                if (this.deviceManager.isSpark2Device()) {
                    await this.deviceManager.sendCommand("request_live_sync", {});
                }
            });
        }

        if (args.action == 'getCurrentChannel') {
            this.deviceManager.sendCommand("get_selected_channel", {});
        }

        if (args.action == 'getDeviceName') {
            this.deviceManager.sendCommand("get_device_name", {});
        }

        if (args.action == 'getDeviceSerial') {
            this.deviceManager.sendCommand("get_device_serial", {});
        }

        if (args.action == 'getPreset') {
            let ch = 0;
            if (args.data >= 0) {
                ch = args.data;
            }
            this.deviceManager.sendCommand("get_preset", ch);
        }

        if (args.action == 'setChannel') {
            this.deviceManager.sendCommand("set_channel", args.data);
        }

        if (args.action == 'setFxParam') {
            this.deviceManager.sendCommand("set_fx_param", args.data);
        }

        if (args.action == 'setFxToggle') {
            this.deviceManager.sendCommand("set_fx_onoff", args.data);
        }

        if (args.action == 'changeFx') {
            this.deviceManager.sendCommand("change_fx", args.data);

            /*setTimeout(() => {
                //apply preset to virtual channel 127
                //  deviceManager.sendCommand("set_channel", 127);
            }, 1000);*/
        }

        if (args.action == 'changeAmp') {
            this.deviceManager.sendCommand("change_amp", args.data);
        }

        if (args.action == 'storePreset') {

            // send current preset with preset and channel num we want to store to
            this.deviceManager.sendCommand("set_preset_from_model", args.data);

        }

    }
}
