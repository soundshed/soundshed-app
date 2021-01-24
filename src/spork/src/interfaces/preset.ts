export interface Preset {
    meta?: Meta;
    type?: string;
    sigpath?: SignalPath[];
    bpm?: number;
}

export interface Meta {
    description: string;
    version: string;
    name: string;
    icon: string;
    id: string;
}

export interface FxParam {
    value: any;
    index: number;
    name?: string; // used in fx catalog to describe param in UI
    type?: string;
}

export interface FxParamMessage extends FxParam {
    dspId: string;
}

export interface PresetChangeMessage extends FxParam {
    presetNumber: number;
}
export interface FxChangeMessage {
    dspIdOld: string;
    dspIdNew: string;
}

export interface FxToggleMessage {
    dspId: string;
    active: boolean;
}

export interface SignalPath {
    active: boolean;
    params: FxParam[];
    type: string;
    dspId: string;
    name?: string;
    description?: string;
}
export interface DeviceState {

    selectedPresetNumber?: number;
    presetConfig?: Preset;
    lastMessageReceived?: any;

}
export interface FxCatalogItem {
    type: string;
    dspId: string;
    name: string;
    description?: string;
    params: Array<FxParam>;
}

export interface FXCatalogItemType {
    id: string;
    name: string;
    index: number;
    description: string;
}
export interface FxCatalog {
    types: Array<FXCatalogItemType>;
    catalog: Array<FxCatalogItem>;
}