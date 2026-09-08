import { contextBridge, ipcRenderer } from "electron";

// The web application receives only a declarative desktop marker. Local-node
// credentials, shell access, Docker, files, and arbitrary IPC stay in main.
contextBridge.exposeInMainWorld("creativesosDesktop", Object.freeze({
  platform: process.platform,
  localNodeMenu: true,
}));
