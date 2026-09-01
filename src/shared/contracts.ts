export type ServicePhase = 'stopped' | 'starting' | 'running' | 'stopping' | 'failed'

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
  | 'not-logged-in'
  | 'offline'
  | 'ready'
  | 'starting'
  | 'connected'
  | 'stopping'
  | 'failed'
export type ChatGPTPhase = 'not-connected' | 'waiting-request' | 'waiting-authorization' | 'connected' | 'stale'

export interface DesktopSnapshot {
  core: CoreStatus
  tunnel: TunnelStatus
  chatgpt: ChatGPTStatus
  projects: ProjectSummary[]
  appVersion: string
  settings: AppSettingsSnapshot
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
  getSnapshot(): Promise<DesktopSnapshot>
  startCore(): Promise<CoreStatus>
  stopCore(): Promise<CoreStatus>
  subscribe(listener: (snapshot: DesktopSnapshot) => void): () => void
  openChatGPT(): Promise<void>
  selectProject(): Promise<ProjectCandidate | null>
  authorizeProject(token: string, confirmHighRisk: boolean): Promise<ProjectMutationResult>
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
  openLogsFolder(): Promise<void>
  openTailscaleDownload(): Promise<void>
}

export const ipcChannels = {
  getSnapshot: 'desktop:get-snapshot',
  startCore: 'desktop:start-core',
  stopCore: 'desktop:stop-core',
  snapshotChanged: 'desktop:snapshot-changed',
  openChatGPT: 'desktop:open-chatgpt',
  selectProject: 'projects:select',
  authorizeProject: 'projects:authorize',
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
  openLogsFolder: 'diagnostics:open-folder',
  openTailscaleDownload: 'tunnel:open-download'
} as const
