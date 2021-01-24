import { FxParam, Preset, SignalPath } from "../spork/src/interfaces/preset";
import { Tone, ToneFx, ToneFxParam } from "./soundshedApi";
import { nanoid } from 'nanoid'

export class FxMappingToneToSpark {
    mapFxCategory(type) {
        return type;
    }
    mapFxId(type) {
        return type;
    }

    mapFx(source: ToneFx): SignalPath {
        return {
            active: source.enabled,
            params: source.params.map((p => { return <FxParam>{ index: 0, value: p.value, name: "" } })),
            type: this.mapFxCategory(source.type),
            dspId: this.mapFxId(source.type),
            name: source.name
        }
    }

    /** map from soundshed tone to a spark preset */
    mapFrom(source: Tone) {
        let dest: Preset = {
            meta: { name: source.name, description: source.description, id: source.toneId, version: source.version, icon: "icon.png" },
            sigpath: source.fx.map(fx => this.mapFx(fx)),
            type: "",
            bpm: source.bpm
        }
        return dest;
    }
}

export class FxMappingSparkToTone {

    mapFx(source: SignalPath): ToneFx {
        return {
            type: "pg.spark40."+source.dspId,
            name: source.name,
            enabled: true,
            params: source.params.map(p => <ToneFxParam>{ paramId: p.index.toString(), value: p.value, type: p.type, enabled: true })
        };
    }

    mapFrom(source: Preset) {

        if ((<any>source).schemaVersion){
            //already a tone format
            return <Tone>source;
        }

        let dest: Tone = {
            toneId: nanoid(),
            userId: null,
            deviceType: "pg.spark40",
            categories: [],
            artists: [],
            name: source.meta.name,
            description: source.meta.description,
            version: source.meta.version,
            bpm: source.bpm,
            schemaVersion: "1",
            fx: source.sigpath.map(s => this.mapFx(s)),
            timeSig: "4/4",
            datecreated : new Date
        };
        return dest;
    }

}