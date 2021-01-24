import { ipcRenderer } from 'electron';
import { BluetoothDeviceInfo } from '../spork/src/interfaces/deviceController';

import { FxChangeMessage, Preset } from '../spork/src/interfaces/preset';
import { FxMappingSparkToTone } from './fxMapping';
import { SoundshedApi, Tone } from './soundshedApi';

export class AppViewModel {

    public storedPresets: Tone[] = [];
    public tones: Tone[] = [];

    private soundshedApi = new SoundshedApi();

    constructor() {

    }

    log(msg: string) {
        console.log(msg);
    }


    loadFavourites(): Tone[] {
        let favourites: Tone[] = [];
        let allPresets = localStorage.getItem("favourites");
        if (allPresets != null) {
            favourites = JSON.parse(allPresets);
        }

        this.storedPresets = favourites;


        return this.storedPresets;

    }

    async loadLatestTones(): Promise<Tone[]> {
        try {
            const result = await this.soundshedApi.getTones();

            this.tones = result.result ?? [];

            return this.tones;
        } catch (err) {
            return [];
        }
    }

    async storeFavourite(preset: any, includeUpload: boolean =false): Promise<boolean> {

        if (preset != null) {

            let convertedTone = new FxMappingSparkToTone().mapFrom(preset);

            let favourites: Tone[] = [];
            let allPresets = localStorage.getItem("favourites");
            if (allPresets != null) {
                favourites = JSON.parse(allPresets);
            }

            favourites.push(convertedTone);
            localStorage.setItem("favourites", JSON.stringify(favourites));


            this.storedPresets = favourites;

            //attempt upload
            if (includeUpload) {
                try {


                    convertedTone.userId = "6009001158e7487ba4d7241f";
                    convertedTone.artists = ["metallica"];
                    convertedTone.categories = ["metal", "rock"];

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
}

export default AppViewModel;