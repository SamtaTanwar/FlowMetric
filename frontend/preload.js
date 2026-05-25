/* eslint-disable @typescript-eslint/no-require-imports */
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("desktopTracker", {
  start(config) {
    return ipcRenderer.invoke("desktop-tracker:start", config);
  },
  stop() {
    return ipcRenderer.invoke("desktop-tracker:stop");
  },
});
