import { Store } from "pullstate";

export const AppStateStore = new Store({
    isUserSignedIn: false,
    isSignInRequired: false,
    isNativeMode: true,
    isUpdateAvailable: false,
    userInfo: null,
    appInfo: null,
    inputEventMappings: [],
    /** MIDI control mappings (CC learn panel), kept apart from the legacy table above */
    midiControlMappings: [],
    midiInputs: [],
    isMidiInputAvailable: false,
    selectedMidiInput: null,
    midiListenAllInputs: false,
    lastMidiEvent:null,
    numPresetSlots: 4
});
