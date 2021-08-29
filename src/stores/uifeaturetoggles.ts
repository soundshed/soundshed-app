import { Store } from "pullstate";

export const UIFeatureToggleStore = new Store({
    enableCommunityTones: false,
    enabledPGToneCloud: true,
    enableMyTones: true,
    enableToneEditor: true,
    enableLessons: false,
    enableSoundshedLogin: false
});
