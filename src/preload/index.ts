import { contextBridge, ipcRenderer } from 'electron'
import type { DesktopApi, DesktopSnapshot } from '../shared/contracts'
import { ipcChannels } from '../shared/contracts'

const api: DesktopApi = {
  getSnapshot: () => ipcRenderer.invoke(ipcChannels.getSnapshot),
  startCore: () => ipcRenderer.invoke(ipcChannels.startCore),
  stopCore: () => ipcRenderer.invoke(ipcChannels.stopCore),
  openChatGPT: () => ipcRenderer.invoke(ipcChannels.openChatGPT),
  subscribe: (listener) => {
    const handler = (_event: Electron.IpcRendererEvent, snapshot: DesktopSnapshot): void => listener(snapshot)
    ipcRenderer.on(ipcChannels.snapshotChanged, handler)
    return () => ipcRenderer.removeListener(ipcChannels.snapshotChanged, handler)
  }
}

contextBridge.exposeInMainWorld('devspace', api)

declare global {
  interface Window {
    devspace: DesktopApi
  }
}
