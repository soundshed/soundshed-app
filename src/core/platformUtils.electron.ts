import { shell } from "electron";
import { ipcRenderer } from 'electron';
import envSettings from '../env';

const openLink = (e, linkUrl) => {
    e.preventDefault();
    shell.openExternal(linkUrl, {});
  };
  
export {openLink, ipcRenderer as platformEvents};