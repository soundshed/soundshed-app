import { app, shell, ipcRenderer } from "electron";
import { PlatformEvents } from "./utils";
import envSettings from "../env";

const evt: PlatformEvents = new PlatformEvents();

const openLink = (e, linkUrl) => {
    e.preventDefault();
    shell.openExternal(linkUrl, {});
};

const getAppVersion = () => {
    return envSettings.Version;
}

export { openLink, evt as platformEvents, ipcRenderer as nativeEvents, getAppVersion };
