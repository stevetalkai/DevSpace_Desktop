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
  appVersion: string
}

export interface DesktopApi {
  getSnapshot(): Promise<DesktopSnapshot>
  startCore(): Promise<CoreStatus>
  stopCore(): Promise<CoreStatus>
  subscribe(listener: (snapshot: DesktopSnapshot) => void): () => void
  openChatGPT(): Promise<void>
}

export const ipcChannels = {
  getSnapshot: 'desktop:get-snapshot',
  startCore: 'desktop:start-core',
  stopCore: 'desktop:stop-core',
  snapshotChanged: 'desktop:snapshot-changed',
  openChatGPT: 'desktop:open-chatgpt'
} as const
