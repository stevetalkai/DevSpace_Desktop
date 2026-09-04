import { EventEmitter } from 'node:events'
import type { ChatGPTStatus } from '../../shared/contracts'

export interface CoreStructuredEvent {
  ts: string
  level: string
  event: string
  [key: string]: unknown
}

export interface ChatGPTConnectionMonitorOptions {
  now?: () => number
  reconnectTimeoutMs?: number
}

const DEFAULT_RECONNECT_TIMEOUT_MS = 90_000

export class ChatGPTConnectionMonitor extends EventEmitter {
  private readonly now: () => number
  private readonly reconnectTimeoutMs: number
  private prerequisitesReady = false
  private setupStarted = false
  private authorizationKnown = false
  private authorizedConfigured = false
  private readonly activeSessions = new Set<string>()
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private status: ChatGPTStatus = { phase: 'not-connected', lastConnectedAt: null }

  constructor(options: ChatGPTConnectionMonitorOptions = {}) {
    super()
    this.now = options.now ?? Date.now
    this.reconnectTimeoutMs = options.reconnectTimeoutMs ?? DEFAULT_RECONNECT_TIMEOUT_MS
  }

  getStatus(): ChatGPTStatus {
    return { ...this.status }
  }

  setPrerequisites(ready: boolean): ChatGPTStatus {
    if (this.prerequisitesReady === ready) return this.getStatus()
    this.prerequisitesReady = ready
    if (!ready) {
      this.setupStarted = false
      this.activeSessions.clear()
      this.clearReconnectTimer()
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
    if (this.status.phase !== 'connected') {
      this.update({ phase: 'waiting-request', lastConnectedAt: this.status.lastConnectedAt })
      this.armReconnectTimer()
    }
    return this.getStatus()
  }

  accept(event: CoreStructuredEvent): ChatGPTStatus {
    if (event.event === 'oauth_authorization_state' && typeof event.authorizedClientCount === 'number') {
      this.authorizationKnown = true
      this.authorizedConfigured = event.authorizedClientCount > 0
      if (this.activeSessions.size === 0) {
        this.update({
          phase: this.setupStarted
            ? this.status.phase === 'waiting-authorization' ? 'waiting-authorization' : 'waiting-request'
            : this.authorizedConfigured ? 'configured' : 'not-connected',
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
      this.clearReconnectTimer()
      this.markConnected()
    } else if (event.event === 'mcp_session_closed') {
      const sessionId = typeof event.sessionIdPrefix === 'string' ? event.sessionIdPrefix : 'active'
      this.activeSessions.delete(sessionId)
      if (this.activeSessions.size === 0) {
        this.update({ phase: this.authorizedConfigured ? 'configured' : 'not-connected', lastConnectedAt: this.status.lastConnectedAt })
      }
    } else if (isAuthorizationRequest(event)) {
      this.setupStarted = true
      this.update({ phase: 'waiting-authorization', lastConnectedAt: this.status.lastConnectedAt })
      this.armReconnectTimer()
    } else if (this.setupStarted && event.event === 'http_request' && event.path === '/token' && event.status === 200) {
      this.authorizationKnown = true
      this.authorizedConfigured = true
      this.update({ phase: 'waiting-request', lastConnectedAt: this.status.lastConnectedAt })
    }
    return this.getStatus()
  }

  dispose(): void {
    this.clearReconnectTimer()
  }

  private armReconnectTimer(): void {
    this.clearReconnectTimer()
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      this.setupStarted = false
      if (this.activeSessions.size === 0) {
        this.update({ phase: 'stale', lastConnectedAt: this.status.lastConnectedAt })
      }
    }, this.reconnectTimeoutMs)
    this.reconnectTimer.unref?.()
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer === null) return
    clearTimeout(this.reconnectTimer)
    this.reconnectTimer = null
  }

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

function isAuthorizationRequest(event: CoreStructuredEvent): boolean {
  if (event.event !== 'http_request') return false
  if (event.path === '/mcp' && (event.status === 401 || event.status === 403)) return true
  if (event.path === '/authorize') return true
  return event.path === '/'
    && typeof event.referer === 'string'
    && event.referer.startsWith('https://chatgpt.com/')
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
