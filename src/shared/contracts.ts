export type ServicePhase = 'stopped' | 'starting' | 'running' | 'stopping' | 'failed'

export interface CoreStatus {
  phase: ServicePhase
  port: number
  startedAt: string | null
  errorCode: string | null
}

export type TunnelPhase = 'not-configured' | 'checking' | 'connected' | 'failed'
export type ChatGPTPhase = 'not-connected' | 'waiting-request' | 'waiting-authorization' | 'connected' | 'stale'

export interface DesktopSnapshot {
  core: CoreStatus
  tunnel: { phase: TunnelPhase }
  chatgpt: { phase: ChatGPTPhase }
  projects: ProjectSummary[]
  appVersion: string
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
}

export const ipcChannels = {
  getSnapshot: 'desktop:get-snapshot',
  startCore: 'desktop:start-core',
  stopCore: 'desktop:stop-core',
  snapshotChanged: 'desktop:snapshot-changed',
  openChatGPT: 'desktop:open-chatgpt',
  selectProject: 'projects:select',
  authorizeProject: 'projects:authorize',
  removeProject: 'projects:remove'
} as const
