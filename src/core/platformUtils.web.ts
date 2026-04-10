import envSettings from "../env";
import { PlatformEvents } from "./utils";

const evt: PlatformEvents = new PlatformEvents();

const openLink = (e, linkUrl) => {
    e.preventDefault();
    window.open(linkUrl, "_blank", "noopener,noreferrer");
};

const getAppVersion = () => {
    return envSettings.Version;
}

export { openLink, evt as platformEvents, evt as nativeEvents, getAppVersion };
