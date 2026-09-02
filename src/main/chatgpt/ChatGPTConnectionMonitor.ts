import { EventEmitter } from 'node:events'
import type { ChatGPTStatus } from '../../shared/contracts'

export interface CoreStructuredEvent {
  ts: string
  level: string
  event: string
  [key: string]: unknown
}

export interface ChatGPTConnectionMonitorOptions { now?: () => number }

export class ChatGPTConnectionMonitor extends EventEmitter {
  private readonly now: () => number
  private prerequisitesReady = false
  private setupStarted = false
  private authorizationKnown = false
  private authorizedConfigured = false
  private readonly activeSessions = new Set<string>()
  private status: ChatGPTStatus = { phase: 'not-connected', lastConnectedAt: null }

  constructor(options: ChatGPTConnectionMonitorOptions = {}) {
    super()
    this.now = options.now ?? Date.now
  }

  getStatus(): ChatGPTStatus {
    return { ...this.status }
  }

  setPrerequisites(ready: boolean): ChatGPTStatus {
    this.prerequisitesReady = ready
    if (!ready) {
      this.setupStarted = false
      this.activeSessions.clear()
      return this.update({
        phase: this.authorizedConfigured ? 'configured' : 'not-connected',
        lastConnectedAt: this.status.lastConnectedAt
      })
    }
    if (this.authorizationKnown && this.authorizedConfigured) {
      return this.update({ phase: 'configured', lastConnectedAt: this.status.lastConnectedAt })
    }
    return this.getStatus()
  }

  beginSetup(): ChatGPTStatus {
    if (!this.prerequisitesReady) return this.getStatus()
    this.setupStarted = true
    if (this.status.phase !== 'connected' && this.status.phase !== 'configured') {
      this.update({ phase: 'waiting-request', lastConnectedAt: this.status.lastConnectedAt })
    }
    return this.getStatus()
  }

  accept(event: CoreStructuredEvent): ChatGPTStatus {
    if (event.event === 'oauth_authorization_state' && typeof event.authorizedClientCount === 'number') {
      this.authorizationKnown = true
      this.authorizedConfigured = event.authorizedClientCount > 0
      if (this.activeSessions.size === 0) {
        this.update({
          phase: this.authorizedConfigured ? 'configured' : 'not-connected',
          lastConnectedAt: this.status.lastConnectedAt
        })
      }
      return this.getStatus()
    }
    if (!this.prerequisitesReady) return this.getStatus()

    if (event.event === 'mcp_session_created') {
      this.setupStarted = true
      this.authorizationKnown = true
      this.authorizedConfigured = true
      this.activeSessions.add(typeof event.sessionIdPrefix === 'string' ? event.sessionIdPrefix : 'active')
      this.markConnected()
    } else if (event.event === 'mcp_session_closed') {
      const sessionId = typeof event.sessionIdPrefix === 'string' ? event.sessionIdPrefix : 'active'
      this.activeSessions.delete(sessionId)
      if (this.activeSessions.size === 0) {
        this.update({ phase: this.authorizedConfigured ? 'configured' : 'not-connected', lastConnectedAt: this.status.lastConnectedAt })
      }
    } else if (event.event === 'http_request' && event.path === '/mcp' && (event.status === 401 || event.status === 403)) {
      this.setupStarted = true
      this.update({ phase: 'waiting-authorization', lastConnectedAt: this.status.lastConnectedAt })
    } else if (this.setupStarted && event.event === 'http_request' && event.path === '/token' && event.status === 200) {
      this.authorizationKnown = true
      this.authorizedConfigured = true
      this.update({ phase: 'configured', lastConnectedAt: this.status.lastConnectedAt })
    }
    return this.getStatus()
  }

  dispose(): void {}

  private markConnected(): void {
    this.update({ phase: 'connected', lastConnectedAt: new Date(this.now()).toISOString() })
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
