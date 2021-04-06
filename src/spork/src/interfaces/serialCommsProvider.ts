import { BluetoothDeviceInfo } from "./deviceController";

export interface SerialCommsProvider
{
    disconnect();

    connect(device: BluetoothDeviceInfo): Promise<boolean>

    scanForDevices(): Promise<any>;

    listenForData(onListen:(buffer)=>void);

    write(buffer);
}