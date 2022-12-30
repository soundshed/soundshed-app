
import { Store } from "pullstate";

export const DeviceStateStore = new Store({
    isConnected: false,
    isConnectionInProgress: false,
    selectedChannel: -1,
    devices: [],
    connectedDevice: null,
    lastAttemptedDevice: null,
    isDeviceScanInProgress: false,
    deviceScanFailed:false,
    deviceConnectionFailed:false,
    presetTone: null,
    fxCatalog: null
});
