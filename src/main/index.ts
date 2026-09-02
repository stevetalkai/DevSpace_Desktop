import { app, BrowserWindow, clipboard, dialog, ipcMain, safeStorage, shell } from 'electron'
import type { OpenDialogOptions } from 'electron'
import { basename, join } from 'node:path'
import { existsSync, mkdirSync, statSync } from 'node:fs'
import { realpath, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { CoreService, type CoreProcessExit, type CoreProcessOutput } from './core/CoreService'
import { isHighRiskProjectPath, ProjectStore } from './projects/ProjectStore'
import { TailscaleTunnelProvider, TunnelController } from './tunnel'
import { ChatGPTConnectionMonitor, type CoreStructuredEvent } from './chatgpt/ChatGPTConnectionMonitor'
import { OwnerTokenStore } from './security/OwnerTokenStore'
import { DiagnosticLogStore, formatActivityReport, formatDiagnosticReport } from './diagnostics/DiagnosticLogStore'
import { AppSettingsStore, type AppSettings } from './settings/AppSettingsStore'
import { createTrayIcon, TrayController } from './tray/TrayController'
import { resolveCorePort } from './core/CorePortResolver'
import { TailscaleSetupService } from './tailscale/TailscaleSetupService'
import { ActivityStore } from './activity/ActivityStore'
import { ToolCallStore } from './activity/ToolCallStore'
import type { ActivityKind, ActivityState, ChatGPTStatus, CoreStatus, DesktopSnapshot, ProjectCandidate, ProjectMutationResult, ProjectSummary, TailscaleInstallStatus, TunnelStatus } from '../shared/contracts'
import { ipcChannels } from '../shared/contracts'

let coreService: CoreService | null = null
let projectStore: ProjectStore | null = null
let mainWindow: BrowserWindow | null = null
let ownerToken: string | null = null
let settingsStore: AppSettingsStore | null = null
let appSettings: AppSettings = { launchAtLogin: false, locale: null, resumeConnection: false }
let diagnosticLog: DiagnosticLogStore | null = null
let trayController: TrayController | null = null
let tailscaleSetupService: TailscaleSetupService | null = null
let isQuitting = false
const activityStore = new ActivityStore()
const toolCallStore = new ToolCallStore()

app.setName('DevSpace Desktop')
const chatgptMonitor = new ChatGPTConnectionMonitor()
const tunnelController = new TunnelController(
  new TailscaleTunnelProvider({ executablePath: findTailscaleExecutable }),
  () => service().getStatus(),
  async (publicUrl) => { await service().replacePublicBaseUrl(publicUrl) }
)
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
    tunnel: tunnelController.getStatus(),
    chatgpt: chatgptMonitor.getStatus(),
    activities: activityStore.getSnapshot(),
    toolCalls: toolCallStore.getSnapshot(),
    projects: projectSummaries(),
    appVersion: app.getVersion(),
    settings: { ...appSettings }
  }
}

function broadcastSnapshot(): void {
  chatgptMonitor.setPrerequisites(service().getStatus().phase === 'running' && tunnelController.getStatus().phase === 'connected')
  trayController?.refresh()
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
  mainWindow.on('close', (event) => {
    if (isQuitting) return
    event.preventDefault()
    mainWindow?.hide()
  })
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
    await shell.openExternal('https://chatgpt.com/plugins')
  })
  ipcMain.handle(ipcChannels.openChatGPTDeveloperMode, async () => {
    await shell.openExternal('https://chatgpt.com/plugins#settings/Security?section=developer-mode')
  })
  ipcMain.handle(ipcChannels.detectTunnel, () => tunnelController.detect())
  ipcMain.handle(ipcChannels.startTunnel, () => resumeConnection())
  ipcMain.handle(ipcChannels.stopTunnel, () => pauseConnection())
  ipcMain.handle(ipcChannels.copyMcpUrl, (): boolean => {
    const mcpUrl = tunnelController.getStatus().mcpUrl
    if (!mcpUrl) return false
    clipboard.writeText(mcpUrl)
    return true
  })
  ipcMain.handle(ipcChannels.copyOwnerPassword, (): boolean => {
    if (!ownerToken) return false
    clipboard.writeText(ownerToken)
    return true
  })
  ipcMain.handle(ipcChannels.beginChatGPTSetup, () => chatgptMonitor.beginSetup())
  ipcMain.handle(ipcChannels.setLaunchAtLogin, async (_event, enabled: unknown) => {
    if (typeof enabled !== 'boolean') return { ...appSettings }
    app.setLoginItemSettings({ openAtLogin: enabled })
    appSettings = await settings().update({ launchAtLogin: app.getLoginItemSettings().openAtLogin })
    broadcastSnapshot()
    return { ...appSettings }
  })
  ipcMain.handle(ipcChannels.setLocale, async (_event, locale: unknown) => {
    if (locale !== 'zh-Hans' && locale !== 'en') return { ...appSettings }
    appSettings = await settings().update({ locale })
    trayController?.setLocale(locale)
    broadcastSnapshot()
    return { ...appSettings }
  })
  ipcMain.handle(ipcChannels.copyDiagnostics, (): boolean => {
    if (!diagnosticLog) return false
    clipboard.writeText(formatDiagnosticReport({ snapshot: snapshot(), events: diagnosticLog.getRecent() }, app.getVersion()))
    return true
  })
  ipcMain.handle(ipcChannels.exportActivityReport, async (): Promise<boolean> => {
    if (!diagnosticLog) return false
    const generatedAt = new Date()
    const stamp = generatedAt.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, '')
    const options = {
      title: appSettings.locale === 'en' ? 'Export readable DevSpace report' : '导出 DevSpace 可读报告',
      defaultPath: join(app.getPath('documents'), `DevSpace-readable-report-${stamp}.md`),
      filters: [{ name: 'Markdown', extensions: ['md'] }]
    }
    const result = mainWindow
      ? await dialog.showSaveDialog(mainWindow, options)
      : await dialog.showSaveDialog(options)
    if (result.canceled || !result.filePath) return false

    const report = formatActivityReport(
      snapshot(),
      await diagnosticLog.getReportEvents(),
      app.getVersion(),
      appSettings.locale ?? 'zh-Hans',
      generatedAt
    )
    await writeFile(result.filePath, report, { encoding: 'utf8', mode: 0o600 })
    return true
  })
  ipcMain.handle(ipcChannels.openLogsFolder, async () => {
    const logsDirectory = join(app.getPath('userData'), 'logs')
    mkdirSync(logsDirectory, { recursive: true, mode: 0o700 })
    await shell.openPath(logsDirectory)
  })
  ipcMain.handle(ipcChannels.installTailscale, (): Promise<TailscaleInstallStatus> => tailscaleSetup().install())
  ipcMain.handle(ipcChannels.openTailscaleApp, async (): Promise<boolean> => {
    const applicationPath = findTailscaleApplication()
    if (!applicationPath) return false
    return (await shell.openPath(applicationPath)) === ''
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

function findTailscaleExecutable(): string {
  const candidates = process.platform === 'win32'
    ? ['C:\\Program Files\\Tailscale\\tailscale.exe']
    : [
        '/usr/local/bin/tailscale',
        '/opt/homebrew/bin/tailscale',
        '/Applications/Tailscale.app/Contents/MacOS/Tailscale'
      ]
  return candidates.find(existsSync) ?? 'tailscale'
}

function addActivity(kind: ActivityKind, state: ActivityState, detail?: string): void {
  activityStore.add(kind, state, detail)
}

function recordCoreStatus(status: CoreStatus): void {
  const activityByPhase: Record<CoreStatus['phase'], [ActivityKind, ActivityState]> = {
    starting: ['core.starting', 'working'],
    running: ['core.running', 'success'],
    stopping: ['core.stopping', 'working'],
    stopped: ['core.stopped', 'info'],
    failed: ['core.failed', 'error']
  }
  addActivity(...activityByPhase[status.phase])
}

function recordTunnelStatus(status: TunnelStatus): void {
  if (status.phase === 'checking') addActivity('tunnel.checking', 'working')
  else if (status.phase === 'starting') addActivity('tunnel.starting', 'working')
  else if (status.phase === 'connected') addActivity('tunnel.connected', 'success')
  else if (status.phase === 'ready' || status.phase === 'stopping') addActivity('tunnel.stopped', 'info')
  else addActivity('tunnel.failed', 'error')
}

function recordChatGPTStatus(status: ChatGPTStatus): void {
  const activityByPhase: Record<ChatGPTStatus['phase'], [ActivityKind, ActivityState]> = {
    'not-connected': ['chatgpt.disconnected', 'info'],
    'waiting-request': ['chatgpt.waiting_request', 'working'],
    'waiting-authorization': ['chatgpt.waiting_authorization', 'working'],
    configured: ['chatgpt.configured', 'success'],
    connected: ['chatgpt.connected', 'success'],
    stale: ['chatgpt.stale', 'error']
  }
  addActivity(...activityByPhase[status.phase])
}

function recordCoreActivity(event: CoreStructuredEvent): void {
  if (event.event === 'mcp_request') {
    const methods = Array.isArray(event.jsonRpcMethods)
      ? event.jsonRpcMethods.filter((method): method is string => typeof method === 'string')
      : []
    if (methods.includes('tools/call') && event.sessionIdPresent === true) {
      const toolNames = Array.isArray(event.toolNames)
        ? event.toolNames.filter((tool): tool is string => typeof tool === 'string')
        : []
      for (const tool of toolNames) toolCallStore.start(tool, event.ts)
    }
    return
  }
  if (event.event !== 'tool_call') return
  toolCallStore.complete(event)
}

function findTailscaleApplication(): string | null {
  const candidates = process.platform === 'win32'
    ? ['C:\\Program Files\\Tailscale\\Tailscale.exe']
    : process.platform === 'darwin'
      ? ['/Applications/Tailscale.app']
      : []
  return candidates.find(existsSync) ?? null
}

function tailscaleSetup(): TailscaleSetupService {
  if (!tailscaleSetupService) throw new Error('Tailscale setup service is not initialized')
  return tailscaleSetupService
}

function settings(): AppSettingsStore {
  if (!settingsStore) throw new Error('Settings store is not initialized')
  return settingsStore
}

async function pauseConnection(): Promise<ReturnType<TunnelController['getStatus']>> {
  const status = await tunnelController.stop()
  appSettings = await settings().update({ resumeConnection: false })
  broadcastSnapshot()
  return status
}

async function resumeConnection(): Promise<ReturnType<TunnelController['getStatus']>> {
  if (service().getStatus().phase !== 'running') await service().start()
  const status = await tunnelController.start()
  if (status.phase === 'connected') appSettings = await settings().update({ resumeConnection: true })
  broadcastSnapshot()
  return status
}

function showMainWindow(): void {
  if (!mainWindow) createWindow()
  mainWindow?.show()
  mainWindow?.focus()
}

async function applyProjectRoots(): Promise<void> {
  const availableRoots = projectSummaries().filter((project) => project.available).map((project) => project.path)
  await service().replaceAllowedRoots(availableRoots)
}

app.whenReady().then(async () => {
  tailscaleSetupService = new TailscaleSetupService({
    platform: process.platform,
    tempDirectory: app.getPath('temp'),
    openPath: (path) => shell.openPath(path)
  })
  tailscaleSetupService.on('status', (status: TailscaleInstallStatus) => {
    mainWindow?.webContents.send(ipcChannels.tailscaleInstallChanged, status)
  })
  const emptyWorkspace = join(app.getPath('userData'), 'empty-workspace')
  mkdirSync(emptyWorkspace, { recursive: true, mode: 0o700 })
  try {
    const tokenStore = new OwnerTokenStore(join(app.getPath('userData'), 'security', 'owner-token.enc'), safeStorage)
    ownerToken = await tokenStore.getOrCreate()
  } catch {
    const chinese = app.getLocale().toLowerCase().startsWith('zh')
    dialog.showErrorBox(
      chinese ? '无法安全保存密码' : 'Cannot securely store the password',
      chinese
        ? '系统加密存储不可用。DevSpace 未启动，也没有把密码保存为明文。'
        : 'System encryption is unavailable. DevSpace did not start and did not save the password as plain text.'
    )
    app.quit()
    return
  }
  settingsStore = new AppSettingsStore(join(app.getPath('userData'), 'config', 'settings.json'))
  appSettings = await settingsStore.load()
  if (appSettings.launchAtLogin) app.setLoginItemSettings({ openAtLogin: true })
  diagnosticLog = new DiagnosticLogStore({ logsDirectory: join(app.getPath('userData'), 'logs') })
  for (const event of await diagnosticLog.getReportEvents()) {
    if (event.message !== 'tool_call') continue
    const details = event.details && typeof event.details === 'object' && !Array.isArray(event.details) ? event.details : {}
    toolCallStore.complete({ ...details, ts: event.timestamp, level: event.level, event: 'tool_call' })
  }
  projectStore = new ProjectStore(join(app.getPath('userData'), 'config', 'projects.json'))
  void projectStore.load().then((projectSnapshot) => {
    const availableRoots = projectSnapshot.projects
      .map((project) => project.path)
      .filter(isAvailableDirectory)
    void resolveCorePort().then((corePort) => {
    coreService = new CoreService({
      port: corePort,
      allowedRoots: availableRoots.length > 0 ? availableRoots : [emptyWorkspace],
      fallbackRoot: emptyWorkspace,
      configDirectory: join(app.getPath('userData'), 'core'),
      ownerToken: ownerToken ?? undefined
    })
    coreService.on('status', (status) => {
      void diagnosticLog?.append(status.phase === 'failed' ? 'error' : 'info', 'core', `Core ${status.phase}`, { port: status.port, errorCode: status.errorCode })
      recordCoreStatus(status)
      broadcastSnapshot()
    })
    coreService.on('core-event', (event: CoreStructuredEvent) => {
      recordCoreActivity(event)
      chatgptMonitor.accept(event)
      void diagnosticLog?.append('debug', 'core', event.event, event)
      broadcastSnapshot()
    })
    coreService.on('core-output', (output: CoreProcessOutput) => {
      void diagnosticLog?.append(output.stream === 'stderr' ? 'error' : 'debug', 'core-process', output.stream, { line: output.line })
    })
    coreService.on('core-exit', (exit: CoreProcessExit) => {
      void diagnosticLog?.append('error', 'core-process', 'Core process exited unexpectedly', exit)
    })
    tunnelController.on('status', (status) => {
      void diagnosticLog?.append(status.phase === 'failed' ? 'error' : 'info', 'tunnel', `Tunnel ${status.phase}`, { errorCode: status.errorCode, publicUrl: status.publicUrl })
      recordTunnelStatus(status)
      broadcastSnapshot()
    })
    chatgptMonitor.on('status', (status) => {
      void diagnosticLog?.append('info', 'chatgpt', `ChatGPT ${status.phase}`)
      recordChatGPTStatus(status)
      broadcastSnapshot()
    })
    registerIpc()
    createWindow()
    trayController = new TrayController(
      createTrayIcon(),
      snapshot,
      {
        showWindow: showMainWindow,
        openChatGPT: () => shell.openExternal('https://chatgpt.com/plugins'),
        pauseConnection,
        resumeConnection,
        quit: () => app.quit()
      },
      appSettings.locale ?? (app.getLocale().toLowerCase().startsWith('zh') ? 'zh-Hans' : 'en')
    )
    void tunnelController.detect().then(async (detected) => {
      if (detected.phase === 'connected' || appSettings.resumeConnection) {
        await service().start()
        if (detected.phase !== 'connected') await resumeConnection()
        else {
          appSettings = await settings().update({ resumeConnection: true })
          broadcastSnapshot()
        }
      }
    })
    }).catch(() => {
      const chinese = (appSettings.locale ?? app.getLocale()).toLowerCase().startsWith('zh')
      dialog.showErrorBox(
        chinese ? 'DevSpace 无法启动' : 'DevSpace cannot start',
        chinese ? '端口 7676 至 7686 均已被其他程序使用。' : 'Ports 7676 through 7686 are already in use.'
      )
      app.quit()
    })
  })
  app.on('activate', () => {
    showMainWindow()
  })
})

app.on('before-quit', (event) => {
  isQuitting = true
  if (!coreService || coreService.getStatus().phase === 'stopped') return
  event.preventDefault()
  void coreService.stop().finally(() => app.quit())
})

app.on('window-all-closed', () => undefined)

const hasSingleInstanceLock = app.requestSingleInstanceLock()
if (!hasSingleInstanceLock) app.quit()
else app.on('second-instance', showMainWindow)
