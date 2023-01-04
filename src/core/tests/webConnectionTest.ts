import { FxMappingSparkToTone } from "../fxMapping";
import { Tone } from "../soundshedApi";
import { Utils } from "../utils";
import { BleProvider } from "../../spork/src/devices/spark/bleProvider";
import { SparkDeviceManager } from "../../spork/src/devices/spark/sparkDeviceManager";

export class WebConnectionTest {

    log(msg) {
        console.log("WebConnectionTest: " + msg);
    }

    testRunning = false;
    deviceManager = null;
    bleProvider = null

    // basic set of non-ui based tests
    async RunTest() {

        if (!this.testRunning) {

            this.bleProvider= new BleProvider();

            var devices = await this.bleProvider.scanForDevices();

            if (devices == null || devices.length == 0) {
                this.log("No devices to connect to");
                return;
            }

            var device = devices[0];

            //await ble.connect(device);

            // connect
            this.deviceManager = new SparkDeviceManager(this.bleProvider);

            this.deviceManager.onStateChanged = (args: any) => {
                this.log("Device state changed...")

                if (args.lastMessageReceived) {
                    this.log("LastMsg - " + JSON.stringify(args.lastMessageReceived));

                    if (args.lastMessageReceived.type == "preset") {
                        if (args.presetConfig) {
                            // got a preset, convert to Tone object model as required,
                            let t: Tone = args.presetConfig;
                            if (args.presetConfig.meta) {
                                t = new FxMappingSparkToTone().mapFrom(args.presetConfig);

                                this.log("PresetConfig - " + JSON.stringify(args.presetConfig));
                            }

                        }
                    }

                    if (args.lastMessageReceived.type == "hardware_channel_current") {
                        // channel changed, fetch the new preset
                        this.log("Would get preset..")
                      //  this.deviceManager.sendCommand("get_preset", args.lastMessageReceived.presetNumber).then(() => { });
                    }
                }
            };

            await this.deviceManager.connect(device);

            this.testRunning = true;

            while (1) {

                // keep test alive
                await Utils.sleepAsync(500);
            }

        }

        // when connected and processing results, perform a basic set of operations

        // query current channel
        await this.deviceManager.sendCommand("get_selected_channel", {});

        // query preset


        // set channel
        //await deviceManager.sendCommand("set_channel", 1);


    }
}
