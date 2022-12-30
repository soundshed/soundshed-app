import { SerialCommsProvider } from "../../interfaces/serialCommsProvider";
import { BluetoothDeviceInfo } from "../../interfaces/deviceController";
import { Utils } from "../../../../core/utils";
import { SparkMessageReader } from "./sparkMessageReader";

export class BleProvider implements SerialCommsProvider {
    private targetDeviceName = "Spark 40 Audio";
    private selectedDevice: BluetoothDevice;
    private server: BluetoothRemoteGATTServer;
    private service: BluetoothRemoteGATTService;

    serviceGenericUUID = '00001800-0000-1000-8000-00805f9b34fb'; // service 'generic_access'
    serviceCustomUUID = '0000ffc0-0000-1000-8000-00805f9b34fb'; // service 'FFC0'

    deviceCommandCharacteristicUUID = '0xffc1'; // device command messages
    deviceChangesCharacteristicUUID = '0xffc2'; // device change messages

    private commandCharacteristic: BluetoothRemoteGATTCharacteristic;
    private changeCharacteristic: BluetoothRemoteGATTCharacteristic;

    private isConnected: boolean;
    private isConnectedForRead: boolean;

    private sendQueue: Array<DataView>;
    private receiveQueue: Array<Uint8Array>;
    private lastReceivedData: DataView;
    private lastTimeStamp = null;

    constructor() {
        this.isConnectedForRead = false;

        this.sendQueue = [];
        this.receiveQueue = [];
    }

    public async scanForDevices(): Promise<BluetoothDeviceInfo[]> {

        let devices: BluetoothDeviceInfo[] = [];

        const options = { acceptAllDevices: true, optionalServices: [this.serviceGenericUUID, this.serviceCustomUUID] };

        try {
            this.log("Requesting device..");

            // in the browser this prompts the user to select a device, in electron this starts "select-bluetooth-device" and only resolves once a selection is indicated from the UI and the callback has fired
            this.selectedDevice = await navigator.bluetooth.requestDevice(options);

            this.log("Got device selection from chooser. " + JSON.stringify(this.selectedDevice));

            devices.push({ name: this.selectedDevice.name, address: this.selectedDevice.id, port: null });

        } catch (e) {
            this.log("BLE device discovery cancelled or failed. " + JSON.stringify(e));
        }

        return devices;
    }

    public async connect(device: BluetoothDeviceInfo): Promise<boolean> {

        if (this.isConnected) {
            return true;
        }

        this.server = await this.selectedDevice.gatt.connect();

        if (this.server.connected) {
            this.log("Connected to device..");
            this.isConnected = true;

            this.log("Getting Device Service..");

            const service = await this.server.getPrimaryService(this.serviceCustomUUID);

            // generic access service:
            // 00002a00-0000-1000-8000-00805f9b34fb : device name
            // 00002a04-0000-1000-8000-00805f9b34fb : peripheral parameters

            // 65472 [0000ffc0-0000-1000-8000-00805f9b34fb] service
            // characteristic name: 65474 (0xFFC2), handle  7
            // characteristic name: 65473 (0xFFC1), handle  10

            this.log("Getting Device Characteristics..");

            this.commandCharacteristic = await service.getCharacteristic(parseInt(this.deviceCommandCharacteristicUUID));
            this.changeCharacteristic = await service.getCharacteristic(parseInt(this.deviceChangesCharacteristicUUID));

            return true;
        } else {
            this.log("Failed to connected to device..");
            return false;
        }
    }

    hexToBytes(hex: string) {
        for (var bytes = [], c = 0; c < hex.length; c += 2) {
            bytes.push(parseInt(hex.substr(c, 2), 16));
        }

        return bytes;
    }

    buf2hex(buffer) {
        // https://stackoverflow.com/questions/40031688/javascript-arraybuffer-to-hex
        return Array.prototype.map.call(new Uint8Array(buffer), x => ('00' + x.toString(16)).slice(-2)).join('');
    }

    private log(msg, ...args) {
        console.debug("[BLE Provider] : " + msg);

        if (args) {
            args.forEach(element => {
                console.debug("[BLE Provider] : " + element);
            });
        }
    }

    async sendCommand(targetCMD: string) {
        let commandStream = this.hexToBytes(targetCMD);
        return await this.sendCommandBytes(commandStream);
    }

    async sendCommandBytes(commandStream) {

        const uint8Array = new Uint8Array(commandStream);

        this.log(`Writing command changes.. ${uint8Array.length} bytes`);

        let attempts = 5;
        let completed = false;

        while (!completed && attempts > 0) {
            try {
                attempts--;
                await this.commandCharacteristic.writeValueWithoutResponse(uint8Array);
            } catch (err) {
                if (attempts > 0) {
                    this.log("Error writing command changes, retrying..");
                    await Utils.sleepAsync(25);
                } else {
                    this.log("Error writing command changes, giving up..");
                }
            }
        }
    }

    public async disconnect() {

        if (this.selectedDevice.gatt.connected) {
            this.selectedDevice.gatt.disconnect();
        }

        this.isConnected = false;
    }

    private isDataEqual(a: DataView, b: DataView) {
        if (a == null || b == null) return false;

        if (a.byteLength !== b.byteLength) return false;

        for (let i = 0; i < a.byteLength; i++) {
            if (a.getUint8(i) !== b.getUint8(i)) return false;
        }

        return true;
    }

    /*
     start receiving data for our target characteristic, storing in the receive queue
    */
    public async beginQueuedReceive() {

        let enableMultiPartParsing = false;

        try {
            await this.changeCharacteristic.startNotifications();

            this.log('> Notifications started');
            this.isConnectedForRead = true;
            let lastDataRemainder: Uint8Array = new Uint8Array();
            this.changeCharacteristic.addEventListener('characteristicvaluechanged', (event) => {
                const dataView: DataView = (<any>event.target).value;
                let dataChunk = new Uint8Array(dataView.buffer);

                if (event.timeStamp < this.lastTimeStamp) {
                    this.log(`[ERROR]: timestamp out of order`);
                }

                this.log(`[RECV RAW BLE]: ${event.timeStamp} ${this.buf2hex(dataView.buffer)}`);

                if (enableMultiPartParsing) {
                    if (lastDataRemainder.byteLength > 0) {
                        //consumer remainder bytes from last time but prefixing to new chunk
                        dataChunk = SparkMessageReader.mergeBytes(lastDataRemainder, dataChunk);

                        this.log(`[REMAINDER + RAW]: ${this.buf2hex(dataChunk)}`);
                        lastDataRemainder = new Uint8Array();
                    }

                    let terminatorIndexes = [];
                    for (let i = 0; i < dataChunk.byteLength - 1; i++) {
                        if (dataChunk[i] == 0xf7) {
                            //terminator in middle of chunk
                            this.log("Terminator in middle of chunk " + i);
                            terminatorIndexes.push(i);
                        }
                    }

                    if (dataChunk[dataChunk.byteLength - 1] == 0xf7) {
                        // chunk is one block with a terminator

                        this.log(`[PUSHING FULL MSG]: ${this.buf2hex(dataChunk)}`);
                        this.receiveQueue.push(dataChunk);
                    } else {
                        // data has one or more mid-block terminators
                        if (terminatorIndexes.length > 0) {
                            //split


                            let lastIndex = 0;
                            for (let i of terminatorIndexes) {
                                let tmpChunk = dataChunk.slice(lastIndex, i + 1);
                                this.log(`[CHUNK RAW BLE ${lastIndex}-${i + 1}]: ${this.buf2hex(tmpChunk)}`);
                                lastIndex = i + 1;


                                this.log(`[PUSHING CHUNK MSG]: ${this.buf2hex(tmpChunk)}`);
                                this.receiveQueue.push(new Uint8Array(tmpChunk));
                            }

                            let lastTerminator = terminatorIndexes.pop();
                            if (lastTerminator < lastIndex - 1) {
                                // remainder
                                lastDataRemainder = new Uint8Array(dataChunk.slice(lastTerminator, dataChunk.byteLength - 1));

                                this.log(`[SMALL REMAINDER BLE ${lastTerminator + 1}-${dataChunk.byteLength - 1}]: ${this.buf2hex(lastDataRemainder)}`);
                            }

                        } else {
                            // whole chunk has no terminator, use next time
                            lastDataRemainder = new Uint8Array(dataChunk);

                            this.log(`[LARGE REMAINDER BLE]: ${this.buf2hex(lastDataRemainder)}`);
                        }
                    }
                } else {
                    this.receiveQueue.push(dataChunk);
                }
            });
        } catch (err) {
            this.log('> Failed to begin listening for hardware data changes');
        }

    }

    public readReceiveQueue(): Array<Uint8Array> {

        const received = [...this.receiveQueue];
        this.receiveQueue = new Array<Uint8Array>;

        // parse
        return received;
    }

    public peekReceiveQueueEnd(): Uint8Array {
        if (this.receiveQueue.length > 0) {
            return this.receiveQueue[this.receiveQueue.length - 1];
        } else {
            return null;
        }
    }

    public async listenForData(onListen: (buffer) => void) {

        try {
            await this.changeCharacteristic.startNotifications();

            this.log('> listendForData: Notifications started');

            this.isConnectedForRead = true;
            this.changeCharacteristic.addEventListener('characteristicvaluechanged', (event) => {
                const dataView: DataView = (<any>event.target).value;
                onListen(dataView.buffer);
            });
        } catch (err) {
            this.log('> Failed to begin listening for hardware data changes');
        }

    }

    public async write(msg: any) {
        return this.sendCommandBytes(msg);
    }
}
