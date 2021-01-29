
import { Store } from 'pullstate';
import { FxMappingSparkToTone } from './fxMapping';
import { Login, SoundshedApi, Tone } from './soundshedApi';

export const AppStateStore = new Store({
    isUserSignedIn: false,
    isSignInRequired: false,
    isNativeMode:false
});

export const TonesStateStore = new Store({
    toneResults: [],
    storedPresets: []
});

export class AppViewModel {


    private soundshedApi = new SoundshedApi();

    constructor() {

    }

    init() {

        if (this.soundshedApi.isUserSignedIn()) {
            AppStateStore.update(s => { s.isUserSignedIn = true; });
        } else {
            AppStateStore.update(s => { s.isUserSignedIn = false; });
        }
    }

    log(msg: string) {
        console.log(msg);
    }

    async performSignIn(login: Login): Promise<boolean> {

        try {
            let loginResult = await this.soundshedApi.login(login);
            return loginResult.completedOk;
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

    async loadLatestTones(): Promise<Tone[]> {
        try {
            const result = await this.soundshedApi.getTones();

            TonesStateStore.update(s => { s.toneResults =  result.result ?? [] });
            
            return  result.result ?? [];
        } catch (err) {
            return [];
        }
    }

    async storeFavourite(preset: any, includeUpload: boolean = false): Promise<boolean> {

        if (includeUpload && !this.soundshedApi.isUserSignedIn())
        {
            // force sign in before uploading
            AppStateStore.update(s=>{s.isSignInRequired=true});
            return;
        }

        if (preset != null) {

            let convertedTone = new FxMappingSparkToTone().mapFrom(preset);

            let favourites: Tone[] = [];
            let allPresets = localStorage.getItem("favourites");
            if (allPresets != null) {
                favourites = JSON.parse(allPresets);
            }

            if (favourites.find(t => t.name == convertedTone.name)) {
                alert("You already have a preset stored with the same name.")
                return false;
            }

            favourites.push(convertedTone);
            localStorage.setItem("favourites", JSON.stringify(favourites));

            TonesStateStore.update(s => { s.storedPresets = favourites });

            //attempt upload
            if (includeUpload==true) {
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
}

export default AppViewModel;