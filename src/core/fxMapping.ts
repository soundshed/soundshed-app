import { FxParam, Preset, SignalPath } from "../spork/src/interfaces/preset";
import { Tone, ToneFx, ToneFxParam } from "./soundshedApi";
import { Utils } from "./utils";

export class FxMappingToneToSpark {
    mapFxCategory(type) {
        return type;
    }
    mapFxId(type) {
        return type;
    }

    mapFx(source: ToneFx): SignalPath {

        let type = source.type.replace("pg.spark40.", "");
        return {
            active: source.enabled == true,
            params: source.params.map((p => { return <FxParam>{ index: 0, value: p.value, name: "" } })),
            type: this.mapFxCategory(type),
            dspId: this.mapFxId(type),
            name: source.name
        }
    }

    /** map from soundshed tone to a spark preset */
    mapFrom(source: Tone) {
        let dest: Preset = {
            meta: { name: source.name, description: source.description, id: source.toneId, version: source.version, icon: "icon.png" },
            sigpath: source.fx.map(fx => this.mapFx(fx)),
            type: "jamup_speaker",
            bpm: source.bpm ?? 120
        }
        return dest;
    }
}

export class FxMappingSparkToTone {

    mapFx(source: SignalPath): ToneFx {
        return {
            type: "pg.spark40." + source.dspId,
            name: source.name,
            enabled: source.active == true,
            params: source.params.map(p => <ToneFxParam>{ paramId: p.index.toString(), value: p.value, type: p.type, name: p.name, enabled: true })
        };
    }


    mapFrom(source: Preset) {

        if ((<any>source).schemaVersion) {
            //already a tone format, return a copy
            return Object.assign({}, <Tone>source);
        }

        let dest: Tone = {
            toneId: Utils.generateUUID(),
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
            datecreated: new Date
        };
        return dest;
    }

}