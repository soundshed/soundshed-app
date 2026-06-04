import { BluetoothDeviceInfo } from "./deviceController";

export interface SerialCommsProvider {
    disconnect(): Promise<void>;

    connect(device: BluetoothDeviceInfo): Promise<boolean>

    scanForDevices(): Promise<any>;

    beginQueuedReceive(): Promise<boolean>;

    readReceiveQueue() : Array<Uint8Array>;

    peekReceiveQueueEnd() : Uint8Array;

    write(buffer): Promise<void>

    waitForAck?(cmd: number | number[], subCmd: number, timeoutMs?: number): Promise<boolean>;

    isSpark2Connection?(): boolean;

    // Optional: providers that detect unexpected drops expose this as a settable callback.
    onDisconnected?: (() => void) | null;

    // Optional: providers that can reconnect to the last selected device without
    // re-prompting the user should implement this. Returns true on success.
    reconnect?(): Promise<boolean>;
}
