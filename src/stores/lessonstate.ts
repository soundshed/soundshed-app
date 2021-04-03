import { Store } from "pullstate";

export const LessonStateStore = new Store({
    searchResults: [],
    favourites: [],
    playingVideoUrl : null
});