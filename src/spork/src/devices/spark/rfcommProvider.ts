import { SerialCommsProvider } from "../../interfaces/serialCommsProvider";

import * as bluetoothSerial from 'bluetooth-serial-port';
import { BluetoothDeviceInfo } from "../../interfaces/deviceController";

export class RfcommProvider implements SerialCommsProvider
{

    private btSerial: bluetoothSerial.BluetoothSerialPort;
    private targetDeviceName ="Spark 40 Audio";

    constructor(){
        this.btSerial = new bluetoothSerial.BluetoothSerialPort();
    }


    public async scanForDevices(): Promise<BluetoothDeviceInfo[]> {

        return new Promise((resolve, reject) => {

            let resolutionTimeout;

            let devices: BluetoothDeviceInfo[] = [];
            // find bluetooth devices, identify spark devices and capture the device address and name.
            // On each discovery, clear the resolution timeout so that the last item is the one that completes.
            this.btSerial.on('found', (address: string, name: string) => {
                this.log("addr:" + JSON.stringify(address) + " name:" + name)

                if (name == this.targetDeviceName) {

                    address = address.replace(name, "").replace("(", "").replace(")", "");
                    if (!devices.find(d => d.address == address)) {
                        devices.push({ name: name, address: address, port: 2, connectionFailed:false });
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

               /* if (this.onStateChanged) {
                    this.onStateChanged({ type: "connection", status: "failed" });
                } else {
                    this.log("No onStateChange handler defined.")
                }*/

                reject(false);
            });

        })

    }

    private log(msg) {
        console.log("[Rfcomm Provider] : " + msg);
    }


    public async disconnect(){

        this.btSerial.removeAllListeners();

        if (this.btSerial && this.btSerial.isOpen()) {
            this.log("Disconnected");
            this.btSerial.close();
        }
    }

    public listenForData(onListen:(buffer)=>void){
           // setup serial read listeners
           this.btSerial.on('data', (buffer) => {
                onListen(buffer);
           });
    }

    public listenForDevices(onDeviceFound:(address:string, name:string)=>void){
        this.btSerial.on('found', (address: string, name: string) => {
            onDeviceFound(address,name);
        });
    }

    public async write(msg:any){
        return this.btSerial.write(Buffer.from(msg), async (err) => {
            if (err) this.log(err);
        });
    }
}
