import { Store } from "pullstate";

export const LessonStateStore = new Store({
    searchResults: [],
    favourites: [],
    playingVideoUrl : null,
    isSearching: false,
    searchError: null as string | null,
    hasSearched: false
});