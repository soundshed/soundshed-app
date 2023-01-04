import { DeviceMessage } from "./preset";

export interface DeviceController {
    connect(device: BluetoothDeviceInfo): Promise<boolean>;
    disconnect(): Promise<void>;
    readStateMessage(dataArray: Uint8Array[]): Promise<DeviceMessage[]>;
    sendCommand(type: string, data: any): Promise<void>;
}
export interface BluetoothDeviceInfo {
    name: string;
    address: string;
    port: number;
    description?: string;
    connectionFailed?: boolean
}
