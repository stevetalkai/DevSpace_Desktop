import { contextBridge, ipcRenderer } from 'electron'
import type { DesktopApi, DesktopSnapshot } from '../shared/contracts'
import { ipcChannels } from '../shared/contracts'

const api: DesktopApi = {
  getSnapshot: () => ipcRenderer.invoke(ipcChannels.getSnapshot),
  startCore: () => ipcRenderer.invoke(ipcChannels.startCore),
  stopCore: () => ipcRenderer.invoke(ipcChannels.stopCore),
  openChatGPT: () => ipcRenderer.invoke(ipcChannels.openChatGPT),
  selectProject: () => ipcRenderer.invoke(ipcChannels.selectProject),
  authorizeProject: (token, confirmHighRisk) => ipcRenderer.invoke(ipcChannels.authorizeProject, token, confirmHighRisk),
  removeProject: (id) => ipcRenderer.invoke(ipcChannels.removeProject, id),
  detectTunnel: () => ipcRenderer.invoke(ipcChannels.detectTunnel),
  startTunnel: () => ipcRenderer.invoke(ipcChannels.startTunnel),
  stopTunnel: () => ipcRenderer.invoke(ipcChannels.stopTunnel),
  copyMcpUrl: () => ipcRenderer.invoke(ipcChannels.copyMcpUrl),
  copyOwnerPassword: () => ipcRenderer.invoke(ipcChannels.copyOwnerPassword),
  beginChatGPTSetup: () => ipcRenderer.invoke(ipcChannels.beginChatGPTSetup),
  openTailscaleDownload: () => ipcRenderer.invoke(ipcChannels.openTailscaleDownload),
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
