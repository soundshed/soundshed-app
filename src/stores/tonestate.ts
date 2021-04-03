import { Store } from "pullstate";
import { Tone } from "../core/soundshedApi";

export const TonesStateStore = new Store({
    toneResults: [],
    toneCloudResults: [],
    storedPresets: [],
    isSearchInProgress: false
});

export interface IToneEditStore {
    isToneEditorOpen: boolean,
    tone: Tone;
    editTone: Tone;
}
export const ToneEditStore = new Store<IToneEditStore>({
    isToneEditorOpen: false,
    tone: null,
    editTone: null
});