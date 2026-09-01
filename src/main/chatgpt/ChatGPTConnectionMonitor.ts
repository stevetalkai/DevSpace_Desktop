import { EventEmitter } from 'node:events'
import type { ChatGPTStatus } from '../../shared/contracts'

export interface CoreStructuredEvent {
  ts: string
  level: string
  event: string
  [key: string]: unknown
}

export interface ChatGPTConnectionMonitorOptions {
  staleAfterMs?: number
  now?: () => number
}

export class ChatGPTConnectionMonitor extends EventEmitter {
  private readonly staleAfterMs: number
  private readonly now: () => number
  private prerequisitesReady = false
  private setupStarted = false
  private staleTimer: NodeJS.Timeout | null = null
  private status: ChatGPTStatus = { phase: 'not-connected', lastConnectedAt: null }

  constructor(options: ChatGPTConnectionMonitorOptions = {}) {
    super()
    this.staleAfterMs = options.staleAfterMs ?? 5 * 60_000
    this.now = options.now ?? Date.now
  }

  getStatus(): ChatGPTStatus {
    return { ...this.status }
  }

  setPrerequisites(ready: boolean): ChatGPTStatus {
    this.prerequisitesReady = ready
    if (!ready) {
      this.setupStarted = false
      this.clearStaleTimer()
      return this.update({ phase: 'not-connected', lastConnectedAt: this.status.lastConnectedAt })
    }
    return this.getStatus()
  }

  beginSetup(): ChatGPTStatus {
    if (!this.prerequisitesReady) return this.getStatus()
    this.setupStarted = true
    if (this.status.phase !== 'connected') this.update({ phase: 'waiting-request', lastConnectedAt: this.status.lastConnectedAt })
    return this.getStatus()
  }

  accept(event: CoreStructuredEvent): ChatGPTStatus {
    if (!this.prerequisitesReady) return this.getStatus()

    if (event.event === 'mcp_session_created') {
      this.setupStarted = true
      this.markConnected()
    } else if (event.event === 'mcp_request' && this.status.phase === 'connected') {
      this.scheduleStale()
    } else if (event.event === 'http_request' && event.path === '/mcp' && (event.status === 401 || event.status === 403)) {
      this.setupStarted = true
      this.clearStaleTimer()
      this.update({ phase: 'waiting-authorization', lastConnectedAt: this.status.lastConnectedAt })
    } else if (this.setupStarted && event.event === 'http_request' && event.path === '/token' && event.status === 200) {
      this.update({ phase: 'waiting-request', lastConnectedAt: this.status.lastConnectedAt })
    }
    return this.getStatus()
  }

  dispose(): void {
    this.clearStaleTimer()
  }

  private markConnected(): void {
    this.update({ phase: 'connected', lastConnectedAt: new Date(this.now()).toISOString() })
    this.scheduleStale()
  }

  private scheduleStale(): void {
    this.clearStaleTimer()
    this.staleTimer = setTimeout(() => {
      this.staleTimer = null
      if (this.status.phase === 'connected') this.update({ phase: 'stale', lastConnectedAt: this.status.lastConnectedAt })
    }, this.staleAfterMs)
    this.staleTimer.unref()
  }

  private clearStaleTimer(): void {
    if (this.staleTimer) clearTimeout(this.staleTimer)
    this.staleTimer = null
  }

  private update(status: ChatGPTStatus): ChatGPTStatus {
    if (this.status.phase === status.phase && this.status.lastConnectedAt === status.lastConnectedAt) return this.getStatus()
    this.status = status
    const snapshot = this.getStatus()
    this.emit('status', snapshot)
    return snapshot
  }
}

export function parseCoreStructuredEvent(line: string): CoreStructuredEvent | null {
  try {
    const value = JSON.parse(line) as Record<string, unknown>
    if (typeof value.ts !== 'string' || typeof value.level !== 'string' || typeof value.event !== 'string') return null
    return value as CoreStructuredEvent
  } catch {
    return null
  }
}
