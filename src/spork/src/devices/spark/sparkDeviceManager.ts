import { DeviceController, BluetoothDeviceInfo } from "../../interfaces/deviceController";
import { DeviceMessage, DeviceState, Preset } from "../../interfaces/preset";
import { SparkCommandMessage } from "./sparkCommandMessage";
import { FxCatalogProvider } from "./sparkFxCatalog";
import { SparkMessageReader } from "./sparkMessageReader";
import { FxMappingSparkToTone } from "../../../../core/fxMapping";
import { SerialCommsProvider } from "../../interfaces/serialCommsProvider";
import { Utils } from "../../../../core/utils";

export class SparkDeviceManager implements DeviceController {

    public onStateChanged;

    public deviceAddress = "";

    private reader = new SparkMessageReader();

    constructor(private connection: SerialCommsProvider) {

    }

    public async scanForDevices(): Promise<BluetoothDeviceInfo[]> {
        return this.connection.scanForDevices();
    }

    public async connect(device: BluetoothDeviceInfo): Promise<boolean> {

        var connected = await this.connection.connect(device);

        if (connected) {

            // setup device read listener, running as background message receiver
            this.startReceiver();

        } else {
            this.log('Device not yet connected! Cannot listen for data');
        }

        return connected;
    }

    public async startReceiver() {

        // continuously peek message queue for message terminator, then consume queue

        this.log("Starting background receiver");

        this.connection.beginQueuedReceive();

        let msgLoop = async () => {


            let queueContent = this.connection.readReceiveQueue();

            if (queueContent != null && queueContent.length > 0) {
                this.log('Received last message in batch, processing messages ' + queueContent.length);
                for (var c of queueContent) {
                    this.log(`MSG:${c[2]} IDX: ${c[8]} of ${c[7]} \t${this.buf2hex(c)}`);
                }
                await this.readStateMessage(queueContent);
            }
        };

        // initial run
        msgLoop();

        // call msg loop every 50 ms
        setInterval(msgLoop, 50);
    }

    public async disconnect() {
        try {
            await this.connection.disconnect();
        } catch { }
    }

    private buf2hex(buffer: ArrayBuffer) {
        return Array.prototype.map.call(new Uint8Array(buffer), x => ('00' + x.toString(16)).slice(-2)).join('');
    }

    public async readStateMessage(dataArray: Array<Uint8Array>): Promise<DeviceMessage[]> {

        let reader = this.reader;

        reader.set_message(dataArray);

        reader.read_message();

        // reader receivedMessageQueue now contains an ordered list of interpreted messages
        let msgList = reader.readMessageQueue();
        for (let m of msgList) {

            this.log(m);

            if (m.type == 'preset') {
                reader.deviceState.presetConfig = <Preset>m.value;
                this.hydrateDeviceStateInfo(reader.deviceState);
            }

            if (this.onStateChanged) {
                reader.deviceState.message = m;
                this.onStateChanged(reader.deviceState);
            } else {
                this.log("No onStateChange handler defined.")
            }
        }

        return msgList;
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

        let msg = new SparkCommandMessage();

        let msgArray = [];

        if (type == "set_preset") {
            this.log("Setting preset " + JSON.stringify(data));
            msgArray = msg.create_preset(data);
        }

        if (type == "set_preset_from_model") {
            this.log("Setting preset" + JSON.stringify(data));

            if (Array.isArray(data)){
                this.log("Got preset and target channel number");
                // if data is array with preset and channel number  use that
                msgArray = msg.create_preset_from_model(data[0], data[1]);
            }else {
                // set preset to soft channel (not stored to hardware)
                msgArray = msg.create_preset_from_model(data);
            }

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

        // todo: convert to a send queue
        for (let dat of msgArray) {
            try {
                this.log("[SEND RAW]: " + this.buf2hex(dat));

                if (typeof (Buffer) != "undefined") {
                    await this.connection.write(Buffer.from(dat));
                } else {
                    await this.connection.write(dat);
                }


            } catch (err) {
                console.warn("Caught err writing msg array");
                await Utils.sleepAsync(100);
            }
        }

    }

    hexToUint8Array(hex: string): Uint8Array {
        for (var bytes = [], c = 0; c < hex.length; c += 2) {
            bytes.push(parseInt(hex.substr(c, 2), 16));
        }

        return new Uint8Array(bytes);
    }

    private log(msg) {
        console.info("[SparkDeviceManager]:");
        console.info(msg);
    }
}
