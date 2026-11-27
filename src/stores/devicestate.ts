
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
    // The hardware slot presetTone was loaded from (a preset reply from the amp, or a
    // store to the selected slot). null while the selected channel's preset is still
    // loading, or when the tone isn't a stored channel's (Live, disconnected). A
    // channel rename uploads presetTone, so it is only allowed when this is that slot.
    presetToneSlot: null as number | null,
    fxCatalog: null,
    // Set by any edit to the tone on screen (from the app or reported by the amp) and
    // cleared only when the selected channel is known to match what is stored on it.
    // It may wrongly read "changed"; that only produces an extra warning.
    hasUnsavedEdits: false,
    // The last name known for each hardware slot, this session only.
    slotNames: {} as Record<number, string>,
    // Set when a save with a new name read the slot back and the amp reported a
    // different name; the amp screen shows it as a notice and clears it.
    lastNameCheck: null as { slot: number, expected: string, reported: string } | null
});
