import { app, shell, ipcRenderer } from "electron";

const openLink = (e, linkUrl) => {
    e.preventDefault();
    shell.openExternal(linkUrl, {});
  };
  
const getAppVersion = () => {
  return  app.getVersion()?.replace("v", "")
}

export {openLink, ipcRenderer as platformEvents, getAppVersion};