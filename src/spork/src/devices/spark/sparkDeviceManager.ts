import { DeviceController, BluetoothDeviceInfo } from "../../interfaces/deviceController";
import { DeviceState } from "../../interfaces/preset";
import { SparkCommandMessage } from "./sparkCommandMessage";
import { FxCatalogProvider } from "./sparkFxCatalog";
import { SparkMessageReader } from "./sparkMessageReader";

import { FxMappingSparkToTone } from "../../../../core/fxMapping";
import { SerialCommsProvider } from "../../interfaces/serialCommsProvider";
import { Utils } from "../../../../core/utils";

export class SparkDeviceManager implements DeviceController {

    private latestStateReceived = [];
    private stateInfo: any;

    public onStateChanged;
    private lastStateTime = new Date().getTime()

    public deviceAddress = "";

    private reader = new SparkMessageReader();

    constructor(private connection: SerialCommsProvider) {

    }

    static sleepAsync = (delay) => new Promise((resolve) => setTimeout(resolve, delay));

    public async scanForDevices(): Promise<BluetoothDeviceInfo[]> {
        return this.connection.scanForDevices();
    }

    public async connect(device: BluetoothDeviceInfo): Promise<boolean> {

        // disconnect if already connected
        await this.disconnect();

        var connected = await this.connection.connect(device);

        if (connected) {
            // setup serial read listeners
            this.connection.listenForData((buffer: ArrayBuffer) => {

                let currentTime = new Date().getTime();
                this.lastStateTime = currentTime;

                let byteArray = new Uint8Array(buffer);

                this.log("[RECV]: " + this.buf2hex(byteArray));

                this.latestStateReceived.push(byteArray);

                if (byteArray[byteArray.length - 1] == 0xf7) {
                    // end message

                    this.log('Received last message in batch, processing message ' + this.latestStateReceived.length);

                    this.readStateMessage().then(() => {

                    }).finally(() => {
                        this.latestStateReceived = [];
                    });
                }

            });
        }

        return connected;
    }

    public async disconnect() {
        try {
            await this.connection.disconnect();
        } catch { }
    }

    private buf2hex(buffer) { // buffer is an ArrayBuffer
        return Array.prototype.map.call(new Uint8Array(buffer), x => ('00' + x.toString(16)).slice(-2)).join('');
    }

    public async readStateMessage() {

        this.log("Reading state message:" + this.buf2hex(this.latestStateReceived));

        let reader = this.reader;

        reader.set_message(this.latestStateReceived);


        let b = reader.read_message();

        this.stateInfo = reader.text;

        if (reader.deviceState.lastMessageReceived.type == 'jamup_speaker') {
            this.hydrateDeviceStateInfo(reader.deviceState);
        }

        if (this.onStateChanged) {
            this.onStateChanged(reader.deviceState);
        } else {
            this.log("No onStateChange handler defined.")
        }
    }

    private hydrateDeviceStateInfo(deviceState: DeviceState) {

        let fxCatalog = FxCatalogProvider.getFxCatalog();

        // populate metadata about fx etc
        if (deviceState.presetConfig) {
            for (let fx of deviceState.presetConfig.sigpath) {
                let dspId = fx.dspId;
                if (dspId.indexOf("bias.reverb") > -1) {
                    //map mode variant to our config dspId
                    dspId = FxMappingSparkToTone.getReverbDspId(fx.params[6].value);
                } else {
                    dspId = FxMappingSparkToTone.mapFxId(dspId);
                }

                let dsp = fxCatalog.catalog.find(f => f.dspId == dspId);

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
                    this.log("DSP Id is not present in FX Catalog: " + dspId);

                    fx.name = FxMappingSparkToTone.mapFxId(fx.dspId);
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


    public async sendCommand(type, data) {

        this.latestStateReceived = [];

        /*if (this.sendInProgress) {
            // if we are already sending something wait until we're finished that before doing anything else
            while (this.sendInProgress) {
                this.log("Send request while still sending another command. Queuing..")
                await SparkDeviceManager.sleepAsync(100);
            }

        }*/
        this.log("sending command");

        let msg = new SparkCommandMessage();

        let msgArray = [];

        if (type == "set_preset") {
            this.log("Setting preset " + JSON.stringify(data));
            msgArray = msg.create_preset(data);
        }

        if (type == "set_preset_from_model") {
            this.log("Setting preset" + JSON.stringify(data));
            msgArray = msg.create_preset_from_model(data);
        }

        if (type == "store_current_preset") {
            this.log("Storing preset" + JSON.stringify(data));
            msgArray = msg.store_current_preset(data);
        }

        if (type == "set_channel") {
            this.log("Setting hardware channel " + JSON.stringify(data));
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
            msgArray = msg.request_preset_state(data);
        }

        if (type == "get_selected_channel") {
            this.log("Getting device current channel selection");
            msgArray = msg.request_info(0x10);
        }

        if (type == "get_device_name") {
            this.log("Getting device name");
            msgArray = msg.request_info(0x11);
        }

        if (type == "get_device_serial") {
            this.log("Getting device serial");
            msgArray = msg.request_info(0x23);
        }

        for (let dat of msgArray) {
            try {
                this.log("[SEND RAW]: " + this.buf2hex(dat));
                // this.log("[SEND]: " + this.buf2hex(msg));

                if (typeof (Buffer) != "undefined") {
                    await this.connection.write(Buffer.from(dat));
                } else {
                    await this.connection.write(dat);
                }

                await Utils.sleepAsync(100);
            } catch (err) {
                console.warn("Caught err writing msg array");
            }
        }

    }


    hexToBytes(hex: string) {
        for (var bytes = [], c = 0; c < hex.length; c += 2) {
            bytes.push(parseInt(hex.substr(c, 2), 16));
        }

        return bytes;
    }

    private log(msg) {
        console.debug("[SparkDeviceManager]: " + msg);
    }
}
