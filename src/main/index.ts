import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import type { OpenDialogOptions } from 'electron'
import { basename, join } from 'node:path'
import { existsSync, mkdirSync, statSync } from 'node:fs'
import { realpath } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { CoreService } from './core/CoreService'
import { isHighRiskProjectPath, ProjectStore } from './projects/ProjectStore'
import type { DesktopSnapshot, ProjectCandidate, ProjectMutationResult, ProjectSummary } from '../shared/contracts'
import { ipcChannels } from '../shared/contracts'

let coreService: CoreService | null = null
let projectStore: ProjectStore | null = null
let mainWindow: BrowserWindow | null = null
const pendingProjects = new Map<string, { path: string; highRisk: boolean; expiresAt: number }>()

function service(): CoreService {
  if (!coreService) throw new Error('Core service is not initialized')
  return coreService
}

function projects(): ProjectStore {
  if (!projectStore) throw new Error('Project store is not initialized')
  return projectStore
}

function projectSummaries(): ProjectSummary[] {
  return projects().getSnapshot().projects.map(({ id, name, path, addedAt }) => ({
    id,
    name,
    path,
    addedAt,
    available: isAvailableDirectory(path)
  }))
}

function isAvailableDirectory(path: string): boolean {
  try {
    return existsSync(path) && statSync(path).isDirectory()
  } catch {
    return false
  }
}

function snapshot(): DesktopSnapshot {
  return {
    core: service().getStatus(),
    tunnel: { phase: 'not-configured' },
    chatgpt: { phase: 'not-connected' },
    projects: projectSummaries(),
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
  ipcMain.handle(ipcChannels.selectProject, async (): Promise<ProjectCandidate | null> => {
    const options: OpenDialogOptions = {
      properties: ['openDirectory', 'createDirectory'],
      securityScopedBookmarks: process.platform === 'darwin'
    }
    const result = mainWindow
      ? await dialog.showOpenDialog(mainWindow, options)
      : await dialog.showOpenDialog(options)
    const selectedPath = result.filePaths[0]
    if (result.canceled || !selectedPath) return null

    const canonicalPath = await realpath(selectedPath)
    const token = randomUUID()
    const highRisk = isHighRiskProjectPath(canonicalPath)
    pendingProjects.set(token, { path: canonicalPath, highRisk, expiresAt: Date.now() + 10 * 60_000 })
    return { token, path: canonicalPath, name: basename(canonicalPath) || canonicalPath, highRisk }
  })
  ipcMain.handle(
    ipcChannels.authorizeProject,
    async (_event, token: unknown, confirmHighRisk: unknown): Promise<ProjectMutationResult> => {
      if (typeof token !== 'string' || typeof confirmHighRisk !== 'boolean') return { ok: false, errorCode: 'candidate_expired' }
      const candidate = pendingProjects.get(token)
      if (!candidate || candidate.expiresAt < Date.now()) {
        pendingProjects.delete(token)
        return { ok: false, errorCode: 'candidate_expired' }
      }
      if (candidate.highRisk && !confirmHighRisk) return { ok: false, errorCode: 'high_risk_confirmation_required' }

      try {
        await projects().add(candidate.path)
        pendingProjects.delete(token)
        await applyProjectRoots()
        broadcastSnapshot()
        return { ok: true }
      } catch (error) {
        const code = error instanceof Error && /ENOENT|not a directory/i.test(error.message)
          ? 'project_unavailable'
          : 'project_save_failed'
        return { ok: false, errorCode: code }
      }
    }
  )
  ipcMain.handle(ipcChannels.removeProject, async (_event, id: unknown): Promise<ProjectMutationResult> => {
    if (typeof id !== 'string') return { ok: false, errorCode: 'project_save_failed' }
    try {
      await projects().remove(id)
      await applyProjectRoots()
      broadcastSnapshot()
      return { ok: true }
    } catch {
      return { ok: false, errorCode: 'project_save_failed' }
    }
  })
}

async function applyProjectRoots(): Promise<void> {
  const availableRoots = projectSummaries().filter((project) => project.available).map((project) => project.path)
  await service().replaceAllowedRoots(availableRoots)
}

app.whenReady().then(() => {
  const emptyWorkspace = join(app.getPath('userData'), 'empty-workspace')
  mkdirSync(emptyWorkspace, { recursive: true, mode: 0o700 })
  projectStore = new ProjectStore(join(app.getPath('userData'), 'config', 'projects.json'))
  void projectStore.load().then((projectSnapshot) => {
    const availableRoots = projectSnapshot.projects
      .map((project) => project.path)
      .filter(isAvailableDirectory)
    coreService = new CoreService({
      allowedRoots: availableRoots.length > 0 ? availableRoots : [emptyWorkspace],
      fallbackRoot: emptyWorkspace,
      configDirectory: join(app.getPath('userData'), 'core')
    })
    coreService.on('status', broadcastSnapshot)
    registerIpc()
    createWindow()
  })
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
