import { app, BrowserWindow, ipcMain, shell } from 'electron'
import { join } from 'node:path'
import { mkdirSync } from 'node:fs'
import { CoreService } from './core/CoreService'
import type { DesktopSnapshot } from '../shared/contracts'
import { ipcChannels } from '../shared/contracts'

let coreService: CoreService | null = null
let mainWindow: BrowserWindow | null = null

function service(): CoreService {
  if (!coreService) throw new Error('Core service is not initialized')
  return coreService
}

function snapshot(): DesktopSnapshot {
  return {
    core: service().getStatus(),
    tunnel: { phase: 'not-configured' },
    chatgpt: { phase: 'not-connected' },
    appVersion: app.getVersion()
  }
}

function broadcastSnapshot(): void {
  mainWindow?.webContents.send(ipcChannels.snapshotChanged, snapshot())
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1120,
    height: 760,
    minWidth: 900,
    minHeight: 640,
    show: false,
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#f4f2ed',
    webPreferences: {
      preload: join(__dirname, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  mainWindow.once('ready-to-show', () => mainWindow?.show())
  mainWindow.on('closed', () => {
    mainWindow = null
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function registerIpc(): void {
  ipcMain.handle(ipcChannels.getSnapshot, () => snapshot())
  ipcMain.handle(ipcChannels.startCore, async () => service().start())
  ipcMain.handle(ipcChannels.stopCore, async () => service().stop())
  ipcMain.handle(ipcChannels.openChatGPT, async () => {
    await shell.openExternal('https://chatgpt.com/')
  })
}

app.whenReady().then(() => {
  const emptyWorkspace = join(app.getPath('userData'), 'empty-workspace')
  mkdirSync(emptyWorkspace, { recursive: true, mode: 0o700 })
  coreService = new CoreService({ allowedRoots: [emptyWorkspace] })
  coreService.on('status', broadcastSnapshot)
  registerIpc()
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('before-quit', (event) => {
  if (!coreService || coreService.getStatus().phase === 'stopped') return
  event.preventDefault()
  void coreService.stop().finally(() => app.exit())
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
