import { Store } from "pullstate";

export const AppStateStore = new Store({
    isUserSignedIn: false,
    isSignInRequired: false,
    isNativeMode: true,
    isUpdateAvailable: false,
    userInfo: null,
    appInfo: null,
    inputEventMappings: [],
    midiInputs: [],
    isMidiInputAvailable: false,
    selectedMidiInput: null,
    lastMidiEvent:null
});
