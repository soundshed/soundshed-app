import { LessonStateStore } from "../stores/lessonstate";
import { Utils } from "./utils";
import VideoSearchApi, { VideoSearchResult } from "./videoSearchApi";

export class LessonManager {
    private videoSearchApi = new VideoSearchApi();
    public async getVideoSearchResults(preferCached: boolean = true, keyword: string) {

        if (preferCached) {
            let results = localStorage.getItem("_videoSearchResults");
            if (results != null) {
                let r = JSON.parse(results);
                LessonStateStore.update(s => { s.searchResults = r });
                return r;
            }
        }

        let r = await this.videoSearchApi.search(keyword);
        LessonStateStore.update(s => { s.searchResults = r });

        localStorage.setItem("_videoSearchResults", JSON.stringify(r));
        return r;
    }

    loadFavourites(): VideoSearchResult[] {
        let favourites: VideoSearchResult[] = [];
        let allPresets = localStorage.getItem("_videofavourites");
        if (allPresets != null) {
            favourites = JSON.parse(allPresets);
        }

        LessonStateStore.update(s => { s.favourites = favourites });

        return favourites;

    }

    async deleteFavourite(v: VideoSearchResult) {
        if (confirm("Are you sure you wish to delete this favourite [" + v.title + "]?")) {
            let favourites: VideoSearchResult[] = [];
            let allPresets = localStorage.getItem("_videofavourites");
            if (allPresets != null) {
                favourites = JSON.parse(allPresets);
                favourites = favourites.filter(f => f.itemId != v.itemId);

                localStorage.setItem("_videofavourites", JSON.stringify(favourites));

                LessonStateStore.update(s => { s.favourites = favourites });
            }
        }
    }

    async storeFavourite(v: VideoSearchResult): Promise<boolean> {

        v = Utils.deepClone(v);

        if (v != null) {

            let favourites: VideoSearchResult[] = [];
            let all = localStorage.getItem("_videofavourites");
            if (all != null) {
                favourites = JSON.parse(all);
            }

            if (!favourites.find(f => f.itemId == v.itemId)) {
                favourites.push(v);
                localStorage.setItem("_videofavourites", JSON.stringify(favourites));

                LessonStateStore.update(s => { s.favourites = favourites });

            }
        }
        return true;
    }
}