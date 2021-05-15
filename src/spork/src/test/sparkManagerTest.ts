import { RfcommProvider } from "../devices/spark/rfcommProvider";
import { SparkDeviceManager } from "../devices/spark/sparkDeviceManager";

let sm = new SparkDeviceManager(new RfcommProvider());

sm.connect({ address: "08:EB:ED:8F:84:0B", name: "Spark 40 Audio", port: 2, connectionFailed:false }).then(async connectedOk => {
    if (connectedOk) {
        await sm.sendCommand("get_preset", 1);
    }

}).then(() => {


});


