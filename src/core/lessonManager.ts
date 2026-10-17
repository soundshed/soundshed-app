import { LessonStateStore } from "../stores/lessonstate";
import { Utils } from "./utils";
import VideoSearchApi, { VideoSearchResult } from "./videoSearchApi";
import { describeVideoSearchError } from "./videoSearchError";

export const VIDEO_SEARCH_CACHE_KEY = "_videoSearchResults";

interface VideoSearchApiLike {
    search(query: string): Promise<VideoSearchResult[]>;
}

export class LessonManager {
    private videoSearchApi: VideoSearchApiLike;

    // Injectable so the search flow can be exercised without calling YouTube.
    constructor(videoSearchApi: VideoSearchApiLike = new VideoSearchApi()) {
        this.videoSearchApi = videoSearchApi;
    }

    public async getVideoSearchResults(preferCached: boolean = true, keyword: string) {

        if (preferCached) {
            let cached = this.readCachedResults();

            // An empty cached array is treated as a miss. Caching [] used to
            // wedge the Jam tab permanently: the mount effect only refreshes
            // when there are no results, but the cache satisfied that request
            // with the same empty array, so no search ever ran again.
            if (cached != null && cached.length > 0) {
                LessonStateStore.update(s => {
                    s.searchResults = cached;
                    s.searchError = null;
                });
                return cached;
            }
        }

        LessonStateStore.update(s => {
            s.isSearching = true;
            s.searchError = null;
        });

        try {
            let r = await this.videoSearchApi.search(keyword);

            LessonStateStore.update(s => {
                s.searchResults = r;
                s.isSearching = false;
                s.searchError = null;
                s.hasSearched = true;
            });

            localStorage.setItem(VIDEO_SEARCH_CACHE_KEY, JSON.stringify(r));
            return r;

        } catch (err) {
            // Previously this rejected into nothing, leaving the tab on its
            // empty state with no indication that anything had gone wrong.
            LessonStateStore.update(s => {
                s.isSearching = false;
                s.searchError = describeVideoSearchError(err);
                s.hasSearched = true;
            });
            return [];
        }
    }

    private readCachedResults(): VideoSearchResult[] | null {
        let raw = localStorage.getItem(VIDEO_SEARCH_CACHE_KEY);
        if (raw == null) return null;

        try {
            let parsed = JSON.parse(raw);
            return Array.isArray(parsed) ? parsed : null;
        } catch {
            // Corrupt cache should not be fatal; fall through to a live search.
            localStorage.removeItem(VIDEO_SEARCH_CACHE_KEY);
            return null;
        }
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
