import { DeviceController, BluetoothDeviceInfo } from "../../interfaces/deviceController";
import { DeviceState, FxCatalogItem } from "../../interfaces/preset";
import { SparkCommandMessage } from "./sparkCommandMessage";
import { FxCatalogProvider } from "./sparkFxCatalog";
import { SparkMessageReader } from "./sparkMessageReader";

export class SparkDeviceManager implements DeviceController {
    private btSerial;

    private latestStateReceived = [];
    private stateInfo: any;

    public onStateChanged;
    private lastStateTime = new Date().getTime()

    public deviceAddress = "";

    private reader = new SparkMessageReader();



    constructor() {

        this.btSerial = new (require('bluetooth-serial-port')).BluetoothSerialPort();

        this.btSerial.on('data', (buffer) => {

            let currentTime = new Date().getTime();
            let timeDelta = currentTime - this.lastStateTime;
            this.lastStateTime = currentTime;

            this.latestStateReceived.push(buffer);


            if (buffer[buffer.length - 1] == 0xf7) {
                // end message 


                this.log('Received last message in batch, processing message ' + this.latestStateReceived.length);

                //this.log(JSON.stringify(this.reader.deviceState))

                this.readStateMessage().then(() => {
                    this.latestStateReceived = [];
                });

            }

        });
    }

    public async scanForDevices(): Promise<any> {



        return new Promise((resolve, reject) => {

            let resolutionTimeout;

            let devices: BluetoothDeviceInfo[] = [];
            // find bluetooth devices, identify spark devices and capture the device address and name. 
            // On each discovery, clear the resolution timeout so that the last item is the one that completes.
            this.btSerial.on('found', (address: string, name: string) => {
                this.log("addr:" + JSON.stringify(address) + " name:" + name)

                if (name == "Spark 40 Audio") {

                    address = address.replace(name, "").replace("(", "").replace(")", "");
                    if (!devices.find(d => d.address == address)) {
                        devices.push({ name: name, address: address, port: 2 });
                    }

                }

                if (resolutionTimeout) {
                    clearTimeout(resolutionTimeout);
                }

                resolutionTimeout = setTimeout(() =>
                    resolve(devices)
                    , 500);

            });

            try {
                this.btSerial.inquire();

            } catch {
                reject();
            }




        });
    }

    public async connect(device: BluetoothDeviceInfo): Promise<boolean> {

        return new Promise((resolve, reject) => {

            this.btSerial.connect(device.address, device.port, () => {
                this.log('bluetooth device connected: ' + device.name);

                resolve(true);

            }, () => {
                this.log(`cannot connect to device [${device.address} ${device.name}]`);

                if (this.onStateChanged) {
                    this.onStateChanged({ type: "connection", status: "failed" });
                } else {
                    this.log("No onStateChange handler defined.")
                }

                reject(false);
            });

        })
    }

    public async disconnect() {
        if (this.btSerial) {
            this.btSerial.close();
        }
    }

    private buf2hex(buffer) { // buffer is an ArrayBuffer
        return Array.prototype.map.call(new Uint8Array(buffer), x => ('00' + x.toString(16)).slice(-2)).join('');
    }

    public async readStateMessage() {

        this.log("Reading state message"); //+ this.buf2hex(this.latestStateReceived));


        let reader = this.reader;

        reader.set_message(this.latestStateReceived);


        let b = reader.read_message();

        this.stateInfo = reader.text;

        this.hydrateDeviceStateInfo(reader.deviceState);

        if (this.onStateChanged) {
            this.onStateChanged(reader.deviceState);
        } else {
            this.log("No onStateChange handler defined.")
        }
    }

    private hydrateDeviceStateInfo(deviceState: DeviceState) {
        let fxCatalog = FxCatalogProvider.db;

        // populate metadata about fx etc
        if (deviceState.presetConfig) {
            for (let fx of deviceState.presetConfig.sigpath) {
                let dsp = fxCatalog.catalog.find(f => f.dspId == fx.dspId);
                if (dsp != null) {
                    fx.type = dsp.type;
                    fx.name = dsp.name;
                    fx.description = dsp.description;

                    for (let p of fx.params) {
                        let paramInfo = dsp.params.find(pa => pa.index == p.index);
                        if (paramInfo) {
                            p.name = paramInfo.name;
                        }
                    }
                } else {
                    fx.name = fx.dspId;
                    fx.description = "(No description)";

                    for (let p of fx.params) {
                        if (p != null) {
                            p.name = "Param " + p.index.toString();
                        }
                    }
                }
            }
        }
    }

    sleep(ms) {
        return new Promise((resolve) => {
            setTimeout(resolve, ms);
        });
    }

    public async sendCommand(type, data) {

        this.log("sending command");

        let msg = new SparkCommandMessage();

        let msgArray = [];

        if (type == "set_preset") {
            this.log("Setting preset");
            msgArray = msg.create_preset(data);
        }

        if (type == "set_preset_from_model") {
            this.log("Setting preset");
            msgArray = msg.create_preset_from_model(data);
        }

        if (type == "store_current_preset") {
            this.log("Storing preset");
            msgArray = msg.store_current_preset(data);
        }

        if (type == "set_channel") {
            this.log("Setting hardware channel");
            msgArray = msg.change_hardware_preset(data);
        }

        if (type == "change_amp") {
            this.log("Changing Amp " + JSON.stringify(data));
            msgArray = msg.change_amp(data.dspIdOld, data.dspIdNew);
        }

        if (type == "set_amp_param") {
            this.log("Changing Amp Param " + JSON.stringify(data));
            msgArray = msg.change_amp_parameter(data.dspId, data.index, data.value);
        }

        if (type == "change_fx") {
            this.log("Changing Effect " + JSON.stringify(data));
            msgArray = msg.change_effect(data.dspIdOld, data.dspIdNew);
        }

        if (type == "set_fx_onoff") {
            this.log("Toggling Effect " + JSON.stringify(data));
            msgArray = msg.turn_effect_onoff(data.dspId, data.value == 1 ? "On" : "Off");
        }

        if (type == "set_fx_param") {
            this.log("Changing Effect Param " + JSON.stringify(data));
            msgArray = msg.change_effect_parameter(data.dspId, data.index, data.value);
        }

        if (type == "get_preset") {
            this.log("Getting preset");
            msgArray = msg.request_preset_state();
        }

        if (type == "get_device_name") {
            this.log("Getting device name");
            msgArray = msg.request_info(0x11);
        }

        if (type == "get_device_serial") {
            this.log("Getting device serial");
            msgArray = msg.request_info(0x23);
        }

        for (let msg of msgArray) {
            this.log("Sending: " + this.buf2hex(msg));
            this.btSerial.write(Buffer.from(msg), async (err, bytesWritten) => {
                if (err) this.log(err);

                // wait for ack
               /* let currentStateTime = this.lastStateTime;
                while (this.lastStateTime == currentStateTime) {
                    await this.sleep(100);
                    this.log("Waiting for ack..")
                }*/

                //this.log("Got ack..")
            });

        }

        this.log("Sent.: ");

    }

    private log(msg) {
        console.log("[Spark Device Manager] : " + msg);
    }
}