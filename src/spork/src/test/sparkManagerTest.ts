import { SparkDeviceManager } from "../devices/spark/sparkDeviceManager";

let sm = new SparkDeviceManager();

sm.connect({ address: "08:EB:ED:8F:84:0B", name: "Spark 40 Audio", port: 2 }).then(async connectedOk => {
    if (connectedOk) {
        await sm.sendCommand("get_preset", 1);
    }

}).then(() => {


});


