import { FxParam, Preset, SignalPath } from "../spork/src/interfaces/preset";
import { Tone, ToneFx, ToneFxParam } from "./soundshedApi";

export class FxMappingToneToSpark {
    mapFxCategory(type) {
        return type;
    }
    mapFxId(type) {
        return type;
    }

    mapFx(source: ToneFx): SignalPath {

        let type=source.type.replace("pg.spark40.","");
        return {
            active: source.enabled,
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
            bpm: source.bpm??120
        }
        return dest;
    }
}

export class FxMappingSparkToTone {

    mapFx(source: SignalPath): ToneFx {
        return {
            type: "pg.spark40."+source.dspId,
            name: source.name,
            enabled: source.active,
            params: source.params.map(p => <ToneFxParam>{ paramId: p.index.toString(), value: p.value, type: p.type, name:p.name, enabled: true })
        };
    }

    generateUUID() { // Public Domain/MIT
        //https://stackoverflow.com/questions/105034/how-to-create-a-guid-uuid
        let d = new Date().getTime();//Timestamp
        let d2 = (performance && performance.now && (performance.now()*1000)) || 0;//Time in microseconds since page-load or 0 if unsupported
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
            var r = Math.random() * 16;//random number between 0 and 16
            if(d > 0){//Use timestamp until depleted
                r = (d + r)%16 | 0;
                d = Math.floor(d/16);
            } else {//Use microseconds since page-load if supported
                r = (d2 + r)%16 | 0;
                d2 = Math.floor(d2/16);
            }
            return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
        });
    }

    mapFrom(source: Preset) {

        if ((<any>source).schemaVersion){
            //already a tone format
            return <Tone>source;
        }

        let dest: Tone = {
            toneId: this.generateUUID(),
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