import envSettings from "../env";
import { PlatformEvents } from "./utils";

const evt: PlatformEvents = new PlatformEvents();

const openLink = (e, linkUrl) => {
    e.preventDefault();
    // open link...
};

const getAppVersion = () => {
    return envSettings.Version;
}

export { openLink, evt as platformEvents, evt as nativeEvents, getAppVersion };
