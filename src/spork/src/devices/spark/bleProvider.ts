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
    private extendedLogging = false;
    public chunkBytesAccumulated = 0;
    private latestChunk = new Uint8Array(39);

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

        this.log("in connect() - flushing receive queue");
        this.flushReceiveQueue();

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

    async sendCommand(targetCMD: string) {
        let commandStream = this.hexToBytes(targetCMD);
        return await this.sendCommandBytes(commandStream);
    }

    async sendCommandBytes(commandStream) {
        if (this.lastMsgTime!=null)
        {
            // check we have waited 200ms since last received data
            let current=new Date();
            if (Math.abs(current.getTime() - this.lastMsgTime.getTime()) <200)
            {
                this.log("Pausing before sending next command");
                await Utils.sleepAsync(1000);
            }
        }

        this.log("in sendCommandBytes() - flushing receive queue");
        this.flushReceiveQueue();

        const uint8Array = new Uint8Array(commandStream);

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


    lastDataRemainder: Uint8Array = new Uint8Array();
    enableMultiPartParsing = true;
    lastMsgTime: Date = null;
    public handleAndQueueMessageData(dataChunk: Uint8Array) {

        let current = new Date();
        /* if (this.lastMsgTime != null) {

            if (Math.abs(current.getTime() - this.lastMsgTime.getTime()) > 500 && (this.receiveQueue.length > 0 || this.lastDataRemainder, length > 0)) {
                //any data we have in queue is stale by 500ms, discarding
                this.lastDataRemainder = new Uint8Array();
                this.receiveQueue = new Array<Uint8Array>();
                this.log(`Q data is stale, discarding`);
            }
        } */
        this.lastMsgTime = current;

        if (this.enableMultiPartParsing) {
            if (this.lastDataRemainder.byteLength > 0) {
                //consumer remainder bytes from last time but prefixing to new chunk
                dataChunk = SparkMessageReader.mergeBytes(this.lastDataRemainder, dataChunk);

                if (this.extendedLogging) this.log(`[REMAINDER + RAW]: ${this.buf2hex(dataChunk)}`);
                this.lastDataRemainder = new Uint8Array();
            }

            let terminatorIndexes = [];
            for (let i = 0; i < dataChunk.byteLength - 1; i++) {
                if (dataChunk[i] == 0xf7) {
                    //terminator in middle of chunk
                    if (this.extendedLogging) this.log("Terminator in middle of chunk " + i);
                    terminatorIndexes.push(i);
                }
            }

            if (dataChunk[dataChunk.byteLength - 1] == 0xf7) {
                // chunk is one block with a terminator

                if (this.extendedLogging) this.log(`[PUSHING FULL MSG]: ${this.buf2hex(dataChunk)}`);
                this.receiveQueue.push(dataChunk);
            } else {
                // data has one or more mid-block terminators
                if (terminatorIndexes.length > 0) {
                    //split

                    let lastIndex = 0;
                    for (let i of terminatorIndexes) {
                        let tmpChunk = dataChunk.slice(lastIndex, i + 1);
                        if (this.extendedLogging) this.log(`[CHUNK RAW BLE ${lastIndex}-${i + 1}]: ${this.buf2hex(tmpChunk)}`);
                        lastIndex = i + 1;


                        if (this.extendedLogging) this.log(`[PUSHING CHUNK MSG]: ${this.buf2hex(tmpChunk)}`);
                        this.receiveQueue.push(new Uint8Array(tmpChunk));
                    }

                    let lastTerminator = terminatorIndexes.pop();
                    if (lastTerminator < lastIndex) {
                        // remainder
                        this.lastDataRemainder = new Uint8Array(dataChunk.slice(lastTerminator + 1));

                        if (this.extendedLogging) this.log(`[PARTIAL REMAINDER BLE ${lastTerminator + 1}-${dataChunk.byteLength - 1}]: ${this.buf2hex(this.lastDataRemainder)}`);
                    }

                } else {
                    // whole chunk has no terminator, use next time
                    this.lastDataRemainder = new Uint8Array(dataChunk);

                    if (this.extendedLogging) this.log(`[FULL REMAINDER BLE]: ${this.buf2hex(this.lastDataRemainder)}`);
                }
            }
        } else {
                this.accumulateChunk(dataChunk);
        }
    }

    // accumumlate partial chunks and only push complete chunks into receiveQueue
    public accumulateChunk(receivedBytes: Uint8Array) {
        for(let i = 0;i<receivedBytes.length;++i){
            // ignore initial bytes that are not 0xf0
            if (this.latestChunk[0] != 0xf0 && receivedBytes[i] != 0xf0)
            {
                continue;
            }

            this.latestChunk[this.chunkBytesAccumulated++] = receivedBytes[i];
            if (receivedBytes[i] == 0xf7)
            {
                // chunk complete

                /* Just logging - can uncomment for debugging
                if (this.latestChunk[4] == 4)
                {
                    // this is an ACK - there's no other chunks to follow
                    this.log(`Received ${SparkMessageReader.getAckMessage(this.latestChunk[5])}`);
                }
                else if (this.latestChunk[4] == 3 && this.latestChunk[7] == 0)
                {
                    // some type 3 commands contain only one chunk
                    this.log(`Chunk complete: ${this.buf2hex(this.latestChunk.subarray(0,this.chunkBytesAccumulated))}`);
                }
                // other types of messages are multi-chunk
                else
                {
                    this.log(`Chunk complete: ${this.buf2hex(this.latestChunk.subarray(0,this.chunkBytesAccumulated))} (${this.latestChunk[8] + 1} of ${this.latestChunk[7]})`);
                } */

                // push complete chunk onto receive queue and reset
                let deepCopy = JSON.parse(JSON.stringify(this.latestChunk)) as typeof this.latestChunk;
                this.receiveQueue.push(deepCopy);
                this.latestChunk.fill(0);
                this.chunkBytesAccumulated = 0;
            }
        }
    }



    /*
     start receiving data for our target characteristic, storing in the receive queue
    */
    public async beginQueuedReceive() {



        try {
            await this.changeCharacteristic.startNotifications();

            this.log('> Notifications started');
            this.isConnectedForRead = true;

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

    private isSingleChunkMessage(chunk : Uint8Array) : boolean {
        return ((chunk[4] == 4) || (chunk[4] == 3 && chunk[7] == 0));
        // command type 4 is an ACK, which is only one chunk
        // some command type 3 commands are only one chunk
        // all other types of messages are multi-chunk
    }

    public readReceiveQueue(): Array<Uint8Array> {
        if (this.receiveQueue.length == 0) {
            return null;
        }

        // process single chunk messages first
        for (let i = 0; i < this.receiveQueue.length; i++) {
            if (this.isSingleChunkMessage(this.receiveQueue[i]))
            {
                // let chunkArr = this.receiveQueue.splice(i, 1);
                // received.push(chunkArr[0]);
                // return received;
                return this.receiveQueue.splice(i,1);
            }
        }

        // this is a multi-chunk message
        let nChunks = this.receiveQueue[0][7];
        if (this.receiveQueue.length < nChunks) {
            // missing chunk(s)
            return null;
        }

        // inefficient, but handles cases where:
        // a) chunks are out of order,
        // b) we have enough chunks, but not (at least) 1 of each numbered chunk
        for (let i = 0; i < nChunks; i++) {
            let foundChunkj = false;
            for (let j = 0; j < this.receiveQueue.length; j++) {
                if (this.receiveQueue[j][8] == i)
                {
                    foundChunkj = true;
                    j = this.receiveQueue.length;
                }
            }
            if (foundChunkj == false) {
                // missing a chunk
                return null;
            }
        }

        // this.log(`Received all chunks (${nChunks})`);
        const received = new Array<Uint8Array>;
        for (let i = 0; i < nChunks; i++) {
            for (let j = 0; j < this.receiveQueue.length; j++) {
                if (this.receiveQueue[j][8] == i)
                {
                    let chunkArr = this.receiveQueue.splice(j, 1);
                    received.push(chunkArr[0]);
                    j = this.receiveQueue.length;
                }
            }
        }
        return received;
    }

    public peekReceiveQueueEnd(): Uint8Array {
        if (this.receiveQueue.length > 0) {
            let msgEnd = this.receiveQueue.findIndex(c => c[8] >= c[7] - 1);
            if (msgEnd > -1) {
                return this.receiveQueue[msgEnd];
            }
        } else {
            return null;
        }
    }

    public async listenForData(onListen: (buffer) => void) {

        try {
            await this.changeCharacteristic.startNotifications();

            this.log('> listenForData: Notifications started');

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

    public flushReceiveQueue() {
        this.chunkBytesAccumulated = 0;
        this.latestChunk.fill(0);
        this.receiveQueue.splice(0);    // this empties the queue
    }
}
