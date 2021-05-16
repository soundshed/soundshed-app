import { SerialCommsProvider } from "../../interfaces/serialCommsProvider";

import { BluetoothDeviceInfo } from "../../interfaces/deviceController";

export class BleProvider implements SerialCommsProvider {
    private targetDeviceName = "Spark 40 Audio";
    private device: BluetoothDevice;
    private server: BluetoothRemoteGATTServer;
    private service: BluetoothRemoteGATTService;

    

    serviceGenericUUID = '00001800-0000-1000-8000-00805f9b34fb'; // service 'generic_access'
    serviceCustomUUID = '0000ffc0-0000-1000-8000-00805f9b34fb'; // service 'FFC0'

    deviceCommandCharacteristicUUID = '0xffc1'; // device command messages
    deviceChangesCharacteristicUUID = '0xffc2'; // device change messages

    private commandCharacteristic: BluetoothRemoteGATTCharacteristic;
    private changeCharacteristic: BluetoothRemoteGATTCharacteristic;

    private isConnected: boolean;
    constructor() {

    }

    public async scanForDevices(): Promise<BluetoothDeviceInfo[]> {

        let devices: BluetoothDeviceInfo[] = [];

        const options = { acceptAllDevices: true, optionalServices: [this.serviceGenericUUID, this.serviceCustomUUID] };

        try {
            this.device = await navigator.bluetooth.requestDevice(options);

            devices.push({ name: this.device.name, address: this.device.id, port: null });
        } catch {
            this.log("BLE device discovery cancelled or failed.");
        }

        return devices;
    }

    public async connect(device: BluetoothDeviceInfo): Promise<boolean> {

        if (this.isConnected) {
            return true;
        }

        this.server = await this.device.gatt.connect();
        this.isConnected = true;

        this.log("Getting Device Service..");

        const service = await this.server.getPrimaryService(this.serviceCustomUUID);

        // generic access service:
        // 00002a00-0000-1000-8000-00805f9b34fb : device name
        // 00002a04-0000-1000-8000-00805f9b34fb : peripheral parameters

        // 65472 [0000ffc0-0000-1000-8000-00805f9b34fb] service
        // characteristic name: 65474 (0xFFC2), handle  7
        // characteristic name: 65473 (0xFFC1), handle  10

        this.log("Getting Device Characteristic..");

        this.commandCharacteristic = await service.getCharacteristic(parseInt(this.deviceCommandCharacteristicUUID));
        this.changeCharacteristic = await service.getCharacteristic(parseInt(this.deviceChangesCharacteristicUUID));

        return true;
    }

    hexToBytes(hex) {
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
        console.log("[BLE Provider] : " + msg);

        if (args){
            args.forEach(element => {
                console.log("[BLE Provider] : " + element);
            });
           
        }
    }

    async sendCommand(targetCMD) {
        let commandStream = this.hexToBytes(targetCMD);
        return await this.sendCommandBytes(commandStream);
    }

    async sendCommandBytes(commandStream) {

        const uint8Array = new Uint8Array(commandStream);

        if (!this.commandCharacteristic.writeValueWithoutResponse) {
            alert("This browser does not support the latest web bluetooth API. Use Chrome or Edge with Experimental Web Platform features flag enabled.");
        }

        this.log("Writing command changes..");
        await (this.commandCharacteristic).writeValueWithResponse(uint8Array);
    }

    public async disconnect() {

        /* this.btSerial.removeAllListeners();
     
         if (this.btSerial && this.btSerial.isOpen()) {
             this.log("Disconnected");
             this.btSerial.close();
         }*/
    }

    public listenForData(onListen: (buffer) => void) {
this.device.gatt.connect();

       /* this.device.addEventListener('advertisementreceived', (event:any) => {
            this.log('Advertisement received.');
            this.log('  Device Name: ' + event.device.name);
            this.log('  Device ID: ' + event.device.id);
            this.log('  RSSI: ' + event.rssi);
            this.log('  TX Power: ' + event.txPower);
            this.log('  UUIDs: ' + event.uuids);

            event.manufacturerData.forEach((valueDataView, key) => {
              this.log('Manufacturer', key, valueDataView);
            });

            event.serviceData.forEach((valueDataView, key) => {
              this.log('Service', key, valueDataView);
            });
          });
      
          this.log('Watching advertisements from "' + this.device.name + '"...');
          return this.device.watchAdvertisements();  
          */

        this.changeCharacteristic.startNotifications().then(_ => {
            this.log('> Notifications started');
            this.changeCharacteristic.addEventListener('characteristicvaluechanged', (event) => {

                var datavalue = (<any>event.target).value.buffer;
                this.log("characteristicvaluechanged: "+this.buf2hex(datavalue));
                onListen(datavalue);
            });
         
          });

       /* this.commandCharacteristic.addEventListener('characteristicvaluechanged',
            (event) => {

                var datavalue = (<any>event.target).value.buffer;
                this.log("characteristicvaluechanged: "+this.buf2hex(datavalue));
                onListen(datavalue);
            });
*/

        // setup serial read listeners
        /*  this.btSerial.on('data', (buffer) => {
               onListen(buffer);
          });*/
    }

    public listenForDevices(onDeviceFound: (address: string, name: string) => void) {
        /* this.btSerial.on('found', (address: string, name: string) => {
             onDeviceFound(address,name);
         });*/
    }

    public async write(msg: any) {
        this.sendCommandBytes(msg);
    }
}