
import { Store } from 'pullstate';
import { FxMappingSparkToTone } from './fxMapping';
import { Login, SoundshedApi, Tone, UserRegistration } from './soundshedApi';
import {ArtistInfoApi} from './artistInfoApi';

import { remote, autoUpdater } from 'electron';
import { Utils } from './utils';
import { PGPresetQuery, SparkAPI } from '../spork/src/devices/spark/sparkAPI';

export const AppStateStore = new Store({
    isUserSignedIn: false,
    isSignInRequired: false,
    isNativeMode: true,
    userInfo: null,
    appInfo: null
});

export const TonesStateStore = new Store({
    toneResults: [],
    toneCloudResults: [],
    storedPresets: []
});

export interface IToneEditStore {
    isToneEditorOpen: boolean,
    tone: Tone;
}
export const ToneEditStore = new Store<IToneEditStore>({
    isToneEditorOpen: false,
    tone: null
});

export const UIFeatureToggleStore = new Store({
    enableCommunityTones: true,
    enabledPGToneCloud: true,
    enableMyTones: true,
    enableToneEditor: true,
    enableLessons: false,
});

export class AppViewModel {


    private soundshedApi = new SoundshedApi();
    private toneCloudApi = new SparkAPI();
    private artistInfoApi = new ArtistInfoApi();

    constructor() {

    }

    init() {

        if (this.soundshedApi.isUserSignedIn()) {
            AppStateStore.update(s => { s.isUserSignedIn = true; s.userInfo = this.soundshedApi.getCurrentUserInfo() });
        } else {
            AppStateStore.update(s => { s.isUserSignedIn = false; s.userInfo = null; });
        }


    }

    log(msg: string) {
        console.log(msg);
    }

    async performSignIn(login: Login): Promise<boolean> {

        try {

            let loginResult = await this.soundshedApi.login(login);

            if (loginResult.completedOk) {
                AppStateStore.update(s => { s.isUserSignedIn = true; s.userInfo = this.soundshedApi.getCurrentUserInfo() });
            }
            return loginResult.completedOk;

        } catch (err) {
            return false;
        }
    }

    async performRegistration(reg: UserRegistration): Promise<boolean> {

        try {

            let regResult = await this.soundshedApi.registerUser(reg);

            if (regResult.completedOk) {
                // now login
                return await this.performSignIn({ email: reg.email, password: reg.password });
            }
            return regResult.completedOk;

        } catch (err) {
            return false;
        }
    }

    loadFavourites(): Tone[] {
        let favourites: Tone[] = [];
        let allPresets = localStorage.getItem("favourites");
        if (allPresets != null) {
            favourites = JSON.parse(allPresets);
        }

        TonesStateStore.update(s => { s.storedPresets = favourites });

        return favourites;

    }



    async deleteFavourite(tone: Tone) {
        if (confirm("Are you sure you wish to delete this tone [" + tone.name + "]?")) {
            let favourites: Tone[] = [];
            let allPresets = localStorage.getItem("favourites");
            if (allPresets != null) {
                favourites = JSON.parse(allPresets);
                favourites = favourites.filter(f => f.toneId != tone.toneId);

                localStorage.setItem("favourites", JSON.stringify(favourites));

                TonesStateStore.update(s => { s.storedPresets = favourites });

                // todo: offer to delete from tone community?
            }
        }
    }

    async storeFavourite(preset: any, includeUpload: boolean = false): Promise<boolean> {

        preset = Utils.deepClone(preset);

        // if tone is already favourite, overwrite

        // if tone is also a community tone, fgl as modified and offer to update

        // if tone is a community tone decide whether to also save new version to API

        if (includeUpload && !this.soundshedApi.isUserSignedIn()) {
            // force sign in before uploading
            AppStateStore.update(s => { s.isSignInRequired = true });
            return;
        }

        if (preset != null) {

     
           
            let convertedTone = new FxMappingSparkToTone().mapFrom(preset);

            if (preset.schemaVersion == "pg.preset.summary" && preset.fx == null) {
                //need to fetch the preset details
                let result = await this.loadToneCloudPreset(preset.externalId);
    
                if (result != null) {
                    
                    let presetData = JSON.parse(result.preset_data);
                    let toneData = new FxMappingSparkToTone().mapFrom(presetData);
                    Object.assign(preset, toneData);
                    preset.imageUrl = result.thumb_url;
                } else {
                    // can't load this tone
                    return;
                }
            }

            if (preset.schemaVersion == "pg.preset.summary" && preset.fx == null) {
                //need to fetch the preset details
                let result = await this.loadToneCloudPreset(preset.externalId);
    
                if (result != null) {
                    
                    let presetData = JSON.parse(result.preset_data);
                    let toneData = new FxMappingSparkToTone().mapFrom(presetData);
                    Object.assign(preset, toneData);
                    t.imageUrl = result.thumb_url;
                } else {
                    // can't load this tone
                    return;
                }
            }

            if (preset.schemaVersion == "pg.preset.summary" && preset.fx == null) {
                //need to fetch the preset details
                let result = await this.loadToneCloudPreset(preset.externalId);
    
                if (result != null) {
                    
                    let presetData = JSON.parse(result.preset_data);
                    let toneData = new FxMappingSparkToTone().mapFrom(presetData);
                    Object.assign(preset, toneData);
                    t.imageUrl = result.thumb_url;
                } else {
                    // can't load this tone
                    return;
                }
            }


            let favourites: Tone[] = [];
            let allPresets = localStorage.getItem("favourites");
            if (allPresets != null) {
                favourites = JSON.parse(allPresets);
            }

            let presetStored = false;
            if (favourites.find(t => t.name.toLowerCase() == convertedTone.name.toLowerCase())) {
                if (confirm("You already have a preset stored with the same name. Do you wish to overwrite it with this one?")) {
                    // update existing
                    favourites = favourites.filter(f => f.name.toLowerCase() != convertedTone.name.toLowerCase());
                    favourites.push(convertedTone);
                    presetStored = true;
                } else {
                    //save new
                    convertedTone.toneId = Utils.generateUUID();
                    favourites.push(convertedTone);
                    presetStored = true;
                }

            }

            if (favourites.find(t => t.name.toLowerCase() != convertedTone.name.toLowerCase() && t.toneId.toLowerCase() == convertedTone.toneId.toLowerCase())) {
                if (confirm("You have changed the name of this preset. Do you wish to save this as a new preset (keep the original)?")) {
                    // add new
                    convertedTone.toneId = Utils.generateUUID();
                    favourites.push(convertedTone);
                    presetStored = true;
                } else {
                    // update existing
                    favourites = favourites.filter(f => f.toneId.toLowerCase() != convertedTone.toneId.toLowerCase());
                    favourites.push(convertedTone);
                    presetStored = true;
                }

            }

            if (!presetStored) {
                //add new
                convertedTone.toneId = Utils.generateUUID();
                favourites.push(convertedTone);
            }

            localStorage.setItem("favourites", JSON.stringify(favourites));

            TonesStateStore.update(s => { s.storedPresets = favourites });

            //attempt upload
            if (includeUpload == true) {
                try {

                    this.soundshedApi.updateTone(convertedTone).then(() => {
                        //tone updated
                        this.log("Tone uploaded to Soundshed");
                        alert("Tone uploaded to Soundshed");
                    });


                } catch (err) {
                    this.log("Error: " + err);
                    alert("Sorry, this tone could not be uploaded to Soundshed at this time.");
                }
            }
            return true;
        }
        else {
            return false;
        }

    }

    async loadLatestTones(): Promise<Tone[]> {
        try {
            const result = await this.soundshedApi.getTones();

            TonesStateStore.update(s => { s.toneResults = result.result ?? [] });

            return result.result ?? [];
        } catch (err) {
            return [];
        }
    }

    async loadToneCloudPreset(id) {
        try {
            const result = await this.toneCloudApi.getToneCloudPreset(id);

            // update our cached info and state info
            if (result != null) {
                //  TonesStateStore.update(s => { s.toneResults = result ?? [] });

                return result;
            } else {
                return null;
            }

        } catch (err) {
            return null;
        }
    }

    async loadLatestToneCloudTones(preferCached: boolean = true, query: PGPresetQuery = null): Promise<Tone[]> {
        try {
            if (preferCached) {
                let cached = localStorage.getItem("_tcResults");

                if (cached != null) {
                    let cachedTones = JSON.parse(cached);
                    TonesStateStore.update(s => { s.toneCloudResults = cachedTones });

                    return cachedTones;
                }
            }
            
            const result = await this.toneCloudApi.getToneCloudPresets(query);

            // convert results to tone
            let tones: Tone[] = result.map(p => <Tone>{
                toneId: "pg.tc." + p.id,
                name: p.name,
                categories: [p.category],
                description: p.description,
                userId: null,
                deviceType: "pg.spark40",
                fx: null,
                bpm: null,
                artists: [],
                version: p.version,
                timeSig: null,
                schemaVersion: "pg.preset.summary",
                imageUrl: p.thumb_url,
                externalId: p.id
            });

            TonesStateStore.update(s => { s.toneCloudResults = tones });

            localStorage.setItem("_tcResults", JSON.stringify(tones));
            return tones;

        } catch (err) {
            return [];
        }
    }


    async performArtistSearch(query:string){
        return await this.artistInfoApi.search(query);
    }

    public refreshAppInfo() {


        try {

            const info = { version: remote.app.getVersion(), name: remote.app.getName() };
            AppStateStore.update(s => { s.appInfo = info });
        } catch (err) {
            this.log("Failed to get app version info: " + err)
        }
    }

    public checkForUpdates() {
        try {
            autoUpdater.checkForUpdates();
        } catch { }
    }

    public signOut() {
        if (confirm("Sign out of your profile?")) {
            this.soundshedApi.signOut();
            AppStateStore.update(s => { s.isUserSignedIn = false; s.userInfo = null; });
        }
    }
}

export default AppViewModel;