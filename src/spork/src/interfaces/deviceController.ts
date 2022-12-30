export interface DeviceController {
    connect(device: BluetoothDeviceInfo): Promise<boolean>;
    disconnect(): Promise<void>;
    readStateMessage(dataArray: Uint8Array[]): Promise<void>;
    sendCommand(type: string, data: any): Promise<void>;
}
export interface BluetoothDeviceInfo {
    name: string;
    address: string;
    port: number;
    description?: string;
    connectionFailed?: boolean
}
