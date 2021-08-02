import { BluetoothDeviceInfo } from "./deviceController";

export interface SerialCommsProvider {
    disconnect(): Promise<void>;

    connect(device: BluetoothDeviceInfo): Promise<boolean>

    scanForDevices(): Promise<any>;

    listenForData(onListen: (buffer) => void);

    write(buffer): Promise<void>
}