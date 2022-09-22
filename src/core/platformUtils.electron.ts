import { app, shell, ipcRenderer } from "electron";
import { PlatformEvents } from "./utils";

const evt: PlatformEvents = new PlatformEvents();

const openLink = (e, linkUrl) => {
    e.preventDefault();
    shell.openExternal(linkUrl, {});
};

const getAppVersion = () => {
    return app.getVersion()?.replace("v", "")
}

export { openLink, evt as platformEvents, ipcRenderer as nativeEvents, getAppVersion };
