
import { Store } from "pullstate";

export const DeviceStateStore = new Store({
    isConnected: false,
    isConnectionInProgress: false,
    selectedChannel: -1,
    // The last real hardware slot (0..numPresetSlots-1) that selectedChannel held, kept
    // while an applied tone is live on the virtual channel (0x7f) so Save to Amp can
    // default to it. null until a hardware channel is known. Not cleared on disconnect,
    // so check it against the connected device's slot count before using it.
    lastHardwareChannel: null as number | null,
    devices: [],
    connectedDevice: null,
    lastAttemptedDevice: null,
    isDeviceScanInProgress: false,
    deviceScanFailed:false,
    deviceConnectionFailed:false,
    // the amp dropped unexpectedly and hasn't connected again since
    connectionLost: false,
    presetTone: null,
    fxCatalog: null
});
