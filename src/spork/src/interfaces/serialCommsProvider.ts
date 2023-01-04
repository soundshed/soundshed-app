import { BluetoothDeviceInfo } from "./deviceController";

export interface SerialCommsProvider {
    disconnect(): Promise<void>;

    connect(device: BluetoothDeviceInfo): Promise<boolean>

    scanForDevices(): Promise<any>;

    beginQueuedReceive();

    readReceiveQueue() : Array<Uint8Array>;

    peekReceiveQueueEnd() : Uint8Array;

    write(buffer): Promise<void>
}
