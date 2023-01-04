import { SerialCommsProvider } from "../../interfaces/serialCommsProvider";
import { BluetoothDeviceInfo } from "../../interfaces/deviceController";
import { Utils } from "../../../../core/utils";
import { SparkMessageReader } from "./sparkMessageReader";

export class BleProvider implements SerialCommsProvider {

    private selectedDevice: BluetoothDevice;
    private server: BluetoothRemoteGATTServer;

    private serviceGenericUUID = '00001800-0000-1000-8000-00805f9b34fb'; // service 'generic_access'
    private serviceCustomUUID = '0000ffc0-0000-1000-8000-00805f9b34fb'; // service 'FFC0'

    private deviceCommandCharacteristicUUID = '0xffc1'; // device command messages
    private deviceChangesCharacteristicUUID = '0xffc2'; // device change messages

    private commandCharacteristic: BluetoothRemoteGATTCharacteristic;
    private changeCharacteristic: BluetoothRemoteGATTCharacteristic;

    private isConnected: boolean;

    private receiveQueue: Array<Uint8Array>;
    private sendQueue: Array<Uint8Array>;

    private lastTimeStamp = null;
    private lastDataChunkRemainder: Uint8Array = new Uint8Array();
    private lastMsgReceivedTime: Date = null;
    private lastMsgSentTime: Date = null;

    private minWaitTimeMSBetweenCommands = 1000;
    private minWaitTimeForMessageQueue = 300;

    constructor() {
        this.receiveQueue = [];
        this.sendQueue = [];
    }

    /**
    * Find one or more bluetooth devices to choose from
    **/
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

            this.log("Getting Device Characteristics..");

            this.commandCharacteristic = await service.getCharacteristic(parseInt(this.deviceCommandCharacteristicUUID));
            this.changeCharacteristic = await service.getCharacteristic(parseInt(this.deviceChangesCharacteristicUUID));

            return true;
        } else {
            this.log("Failed to connect to device..");
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

    getTimeDeltaSinceLastMsg() {
        if (this.lastMsgReceivedTime != null) {
            let current = new Date();
            return Math.abs(current.getTime() - this.lastMsgReceivedTime.getTime())
        } else {
            this.lastMsgReceivedTime = new Date();
        }
    }

    getTimeDeltaSinceLastCmd() {
        if (this.lastMsgSentTime != null) {
            let current = new Date();
            return Math.abs(current.getTime() - this.lastMsgSentTime.getTime())
        } else {
            this.lastMsgSentTime = new Date();
        }
    }

    public async disconnect() {

        if (this.selectedDevice.gatt.connected) {
            this.selectedDevice.gatt.disconnect();
        }

        this.isConnected = false;
    }

    public handleAndQueueMessageData(dataChunk: Uint8Array) {

        this.lastMsgReceivedTime = new Date();

        dataChunk = this.trimHeader(dataChunk);

        // look for f7
        let terminatorIndexes = [];
        for (let b = 0; b < dataChunk.byteLength; b++) {
            if (dataChunk[b] == 0xf7) {
                terminatorIndexes.push(b);
            }
        }

        if (terminatorIndexes.length == 0) {
            // no terminator, append all to remainder
            this.lastDataChunkRemainder = SparkMessageReader.mergeBytes(this.lastDataChunkRemainder, dataChunk);
        } else {

            let currentSliceStartIndex = 0;
            let currentTerminatorItemIdx = 0;

            for (let i of terminatorIndexes) {

                // split item, push result and keep remainder
                let partial = dataChunk.slice(currentSliceStartIndex, i + 1);
                let merged = SparkMessageReader.mergeBytes(this.lastDataChunkRemainder, partial);

                this.receiveQueue.push(merged);

                currentTerminatorItemIdx++;

                if (terminatorIndexes.length > currentTerminatorItemIdx) {
                    // if our next slice will be a full message there is no remainder to add
                    this.lastDataChunkRemainder = new Uint8Array();
                } else {
                    // preserve the remainder of the data chunk for prepending to our next message
                    this.lastDataChunkRemainder = dataChunk.slice(i + 1);
                }

                currentSliceStartIndex = i + 1;
            }
        }
    }

    trimHeader(data: Uint8Array) {
        // Spark 40 multi-part messages have a 16 byte header we can discard
        if ((data[0] == 0x01) && (data[1] == 0xfe)) {
            data = data.subarray(16);
        }
        return data;
    }

    /*
     start receiving data for our target characteristic, storing in the receive queue
    */
    public async beginQueuedReceive() {
        try {
            await this.changeCharacteristic.startNotifications();

            this.log('> Notifications started');

            this.changeCharacteristic.addEventListener('characteristicvaluechanged', (event) => {
                const dataView: DataView = (<any>event.target).value;
                let dataChunk = new Uint8Array(dataView.buffer);

                if (event.timeStamp < this.lastTimeStamp) {
                    this.log(`[ERROR]: timestamp out of order`);
                }

                this.log(`[RECV RAW BLE]: ${event.timeStamp} ${this.buf2hex(dataChunk)}`);

                this.handleAndQueueMessageData(dataChunk);

            });
        } catch (err) {
            this.log('> Failed to begin listening for hardware data changes');
        }

    }

    private isSingleChunkMessage(chunk: Uint8Array): boolean {
        return ((chunk[4] == 4) || (chunk[4] == 3 && chunk[7] == 0));
        // command type 4 is an ACK, which is only one chunk
        // some command type 3 commands are only one chunk
        // all other types of messages are multi-chunk
    }

    public readReceiveQueue(): Array<Uint8Array> {

        if (this.receiveQueue.length == 0) {
            return null;
        }

        // wait a minimum amount of time (e.g. 200ms) before returning our message queue
        if (this.getTimeDeltaSinceLastMsg() < this.minWaitTimeForMessageQueue) {
            return null;
        }

        let lastItem = this.receiveQueue[this.receiveQueue.length - 1];

        // only return our queue if the last item ends in an f7 terminator
        if (lastItem[lastItem.length - 1] == 0xf7) {
            const received = [...this.receiveQueue];
            this.receiveQueue = new Array<Uint8Array>;
            return received;
        } else {
            return null;
        }
    }

    public peekReceiveQueueEnd(): Uint8Array {

        // only return our queue end if the last item ends in an f7 terminator
        let lastItem = this.receiveQueue[this.receiveQueue.length - 1];
        if (lastItem[lastItem.length - 1] == 0xf7) {
            return lastItem;
        } else {
            return null;
        }
    }

    isSendQueueProcessing = false;

    public async write(msg: any) {

        // add this message to start of queue, queue will be processed end-first
        this.sendQueue.unshift(msg);

        if (!this.isSendQueueProcessing) {
            while (this.sendQueue.length > 0) {
                this.isSendQueueProcessing = true;
                let currentMsg = this.sendQueue.pop();

                // todo: consider the type of command last sent to determine wait (presets take longer than fx param changes)
                while (this.getTimeDeltaSinceLastMsg() < this.minWaitTimeMSBetweenCommands) {
                    this.log("Pausing for messages to be received before sending next command ");
                    await Utils.sleepAsync(this.minWaitTimeMSBetweenCommands);
                }

                const uint8Array = new Uint8Array(currentMsg);

                this.log(`Writing command changes.. ${uint8Array.length} bytes`);

                let attempts = 5;
                let completed = false;

                while (!completed && attempts > 0) {
                    try {
                        attempts--;
                        await this.commandCharacteristic.writeValueWithoutResponse(uint8Array);
                        completed = true;
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

            this.isSendQueueProcessing = false;
        }
    }
}
