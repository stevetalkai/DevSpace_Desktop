export type ServicePhase = 'stopped' | 'starting' | 'running' | 'stopping' | 'failed'
export type DesktopPlatform = 'darwin' | 'win32' | 'linux'

export interface CoreStatus {
  phase: ServicePhase
  port: number
  startedAt: string | null
  errorCode: string | null
  processId: number | null
}

export type TunnelPhase =
  | 'checking'
  | 'cli-missing'
  | 'daemon-unavailable'
  | 'coordination-unavailable'
  | 'not-logged-in'
  | 'offline'
  | 'ready'
  | 'starting'
  | 'connected'
  | 'stopping'
  | 'failed'
export type ChatGPTPhase = 'not-connected' | 'waiting-request' | 'waiting-authorization' | 'configured' | 'connected' | 'stale'

export type ActivityState = 'working' | 'success' | 'error' | 'info'

export type ActivityKind =
  | 'core.starting'
  | 'core.running'
  | 'core.stopping'
  | 'core.stopped'
  | 'core.failed'
  | 'tunnel.checking'
  | 'tunnel.starting'
  | 'tunnel.connected'
  | 'tunnel.stopped'
  | 'tunnel.failed'
  | 'chatgpt.waiting_request'
  | 'chatgpt.waiting_authorization'
  | 'chatgpt.configured'
  | 'chatgpt.connected'
  | 'chatgpt.stale'
  | 'chatgpt.disconnected'
  | 'request.received'
  | 'request.tool_started'
  | 'request.completed'
  | 'request.failed'

export interface ActivityItem {
  id: string
  timestamp: string
  kind: ActivityKind
  state: ActivityState
  detail?: string
}

export type ToolCallState = 'working' | 'success' | 'error'

export interface ToolCallItem {
  id: string
  sequence: number
  timestamp: string
  completedAt?: string
  tool: string
  state: ToolCallState
  durationMs?: number
  workspaceId?: string
  path?: string
  workingDirectory?: string
  commandPreview?: string
  files?: string[]
  additions?: number
  removals?: number
  sessionId?: number
  running?: boolean
  exitCode?: number
  error?: string
}

export interface DesktopSnapshot {
  core: CoreStatus
  tunnel: TunnelStatus
  chatgpt: ChatGPTStatus
  activities: ActivityItem[]
  toolCalls: ToolCallItem[]
  projects: ProjectSummary[]
  appVersion: string
  settings: AppSettingsSnapshot
  tailscaleApplicationInstalled: boolean
}

export interface AppSettingsSnapshot {
  launchAtLogin: boolean
  locale: 'zh-Hans' | 'en' | null
  resumeConnection: boolean
}

export interface ChatGPTStatus {
  phase: ChatGPTPhase
  lastConnectedAt: string | null
}

export interface TunnelStatus {
  phase: TunnelPhase
  publicUrl: string | null
  mcpUrl: string | null
  errorCode: string | null
}

export type TailscaleInstallPhase =
  | 'idle'
  | 'downloading'
  | 'opening-installer'
  | 'installer-opened'
  | 'unsupported'
  | 'failed'

export interface TailscaleInstallStatus {
  phase: TailscaleInstallPhase
  downloadedBytes: number
  totalBytes: number | null
  errorCode: 'download_failed' | 'installer_open_failed' | 'unsupported_platform' | null
}

export interface ProjectSummary {
  id: string
  name: string
  path: string
  addedAt: string
  available: boolean
}

export interface ProjectCandidate {
  token: string
  name: string
  path: string
  highRisk: boolean
}

export type ProjectMutationResult =
  | { ok: true }
  | { ok: false; errorCode: 'candidate_expired' | 'high_risk_confirmation_required' | 'project_unavailable' | 'project_save_failed' }

export interface DesktopApi {
  platform: DesktopPlatform
  getSnapshot(): Promise<DesktopSnapshot>
  startCore(): Promise<CoreStatus>
  stopCore(): Promise<CoreStatus>
  subscribe(listener: (snapshot: DesktopSnapshot) => void): () => void
  openChatGPT(): Promise<void>
  openChatGPTDeveloperMode(): Promise<void>
  selectProject(): Promise<ProjectCandidate | null>
  authorizeProject(token: string, confirmHighRisk: boolean): Promise<ProjectMutationResult>
  openProject(id: string): Promise<boolean>
  removeProject(id: string): Promise<ProjectMutationResult>
  detectTunnel(): Promise<TunnelStatus>
  startTunnel(): Promise<TunnelStatus>
  stopTunnel(): Promise<TunnelStatus>
  copyMcpUrl(): Promise<boolean>
  copyOwnerPassword(): Promise<boolean>
  beginChatGPTSetup(): Promise<ChatGPTStatus>
  setLaunchAtLogin(enabled: boolean): Promise<AppSettingsSnapshot>
  setLocale(locale: 'zh-Hans' | 'en'): Promise<AppSettingsSnapshot>
  copyDiagnostics(): Promise<boolean>
  exportActivityReport(): Promise<boolean>
  openLogsFolder(): Promise<void>
  installTailscale(): Promise<TailscaleInstallStatus>
  openTailscaleApp(): Promise<boolean>
  subscribeTailscaleInstall(listener: (status: TailscaleInstallStatus) => void): () => void
}

export const ipcChannels = {
  getSnapshot: 'desktop:get-snapshot',
  startCore: 'desktop:start-core',
  stopCore: 'desktop:stop-core',
  snapshotChanged: 'desktop:snapshot-changed',
  openChatGPT: 'desktop:open-chatgpt',
  openChatGPTDeveloperMode: 'desktop:open-chatgpt-developer-mode',
  selectProject: 'projects:select',
  authorizeProject: 'projects:authorize',
  openProject: 'projects:open',
  removeProject: 'projects:remove',
  detectTunnel: 'tunnel:detect',
  startTunnel: 'tunnel:start',
  stopTunnel: 'tunnel:stop',
  copyMcpUrl: 'tunnel:copy-mcp-url',
  copyOwnerPassword: 'chatgpt:copy-owner-password',
  beginChatGPTSetup: 'chatgpt:begin-setup',
  setLaunchAtLogin: 'settings:set-launch-at-login',
  setLocale: 'settings:set-locale',
  copyDiagnostics: 'diagnostics:copy',
  exportActivityReport: 'diagnostics:export-activity-report',
  openLogsFolder: 'diagnostics:open-folder',
  installTailscale: 'tailscale:install',
  openTailscaleApp: 'tailscale:open-app',
  tailscaleInstallChanged: 'tailscale:install-changed'
} as const
