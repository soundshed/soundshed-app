
import { SparkDeviceManager } from "../spork/src/devices/spark/sparkDeviceManager";
import { SerialCommsProvider } from "../spork/src/interfaces/serialCommsProvider";

export class DeviceContext {

    deviceManager: SparkDeviceManager;
    msgSendDelegate: (type: string, msg: any) => void;

    public init(commsProvider: SerialCommsProvider, msgDelegate: (type: string, msg: any) => void) {

        console.log("DeviceContext: Init");

        this.deviceManager = new SparkDeviceManager(commsProvider);

        this.deviceManager.onStateChanged = (s: any) => {
            console.log("DeviceContext: device state changed")
            this.sendMessageToApp('device-state-changed', s);
        };


        this.msgSendDelegate = msgDelegate;

    }

    private sendMessageToApp(type: string, args: any) {
        if (this.msgSendDelegate) {
            this.msgSendDelegate(type, args);
        } else {
            console.log("Cannot send message, no delegate provided");
        }
    }

    public performAction(args: any) {
        // ... do actions on behalf of the Renderer
        console.log("got event from render:" + args.action);

        if (args.action == 'scan') {
            this.deviceManager.scanForDevices().then((devices) => {
                console.log(JSON.stringify(devices));

                this.sendMessageToApp('devices-discovered', devices);
            });
        }

        if (args.action == 'connect') {
            console.log("attempting to connect:: " + JSON.stringify(args));

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
            this.deviceManager.sendCommand("set_preset_from_model", args.data).then(()=>{
 setTimeout(() => {
                //apply preset to virtual channel 127
                this.deviceManager.sendCommand("set_channel", 127);
            }, 500);

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
            let ch=0;
            if (args.data>=0)
            {
                ch=args.data;
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

            setTimeout(() => {
                //apply preset to virtual channel 127
                //  deviceManager.sendCommand("set_channel", 127);
            }, 1000);
        }

        if (args.action == 'changeAmp') {
            this.deviceManager.sendCommand("change_amp", args.data);
        }
    }
}
