import { Store } from "pullstate";

export const UIFeatureToggleStore = new Store({
    enableCommunityTones: true,
    enabledPGToneCloud: true,
    enableMyTones: true,
    enableToneEditor: true,
    enableLessons: false,
});
