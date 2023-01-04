export interface DeviceMessage {
    type?:string;
    value?:any;
}

export interface Preset extends DeviceMessage {
    meta?: Meta;
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

export interface FxParam extends DeviceMessage {
    value: any;
    index: number;
    name?: string; // used in fx catalog to describe param in UI
}

export interface FxParamMessage extends FxParam {
    dspId: string;
}

export interface PresetChangeMessage extends FxParam {
    presetNumber: number;
}
export interface FxChangeMessage extends DeviceMessage {
    dspIdOld: string;
    dspIdNew: string;
}

export interface FxToggleMessage extends DeviceMessage {
    dspId: string;
    active: boolean;
}

export interface BpmMessage extends DeviceMessage{
    bpm: number;
}

export interface SignalPath {
    active: boolean;
    params: FxParam[];
    type?: string;
    dspId: string;
    name?: string;
    description?: string;
}

export interface DeviceState {
    selectedPresetNumber?: number;
    bpm?: number;
    presetConfig?: Preset;
    message?: DeviceMessage;
}

export interface FxCatalogItem {
    type: string;
    dspId: string;
    name: string;
    description?: string;
    params: Array<FxParam>;
    isExperimental?: boolean;
    isRemoved?: boolean;
}

export interface FXCatalogItemType {
    id: string;
    name: string;
    index: number;
    description: string;
    isExperimental?: boolean;
    isRemoved?: boolean;
}
export interface FxCatalog {
    types: Array<FXCatalogItemType>;
    catalog: Array<FxCatalogItem>;
}
