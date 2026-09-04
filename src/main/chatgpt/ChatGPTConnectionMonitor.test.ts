import { afterEach, describe, expect, it, vi } from 'vitest'
import { ChatGPTConnectionMonitor, parseCoreStructuredEvent } from './ChatGPTConnectionMonitor'

afterEach(() => vi.useRealTimers())

describe('ChatGPTConnectionMonitor', () => {
  it('accepts only structured Core events', () => {
    expect(parseCoreStructuredEvent('{"ts":"now","level":"info","event":"mcp_session_created"}')).toMatchObject({ event: 'mcp_session_created' })
    expect(parseCoreStructuredEvent('Core started')).toBeNull()
    expect(parseCoreStructuredEvent('{"event":"missing fields"}')).toBeNull()
  })

  it('reports authorization and a real MCP connection without treating health checks as activity', () => {
    const monitor = new ChatGPTConnectionMonitor()
    monitor.setPrerequisites(true)
    monitor.beginSetup()
    monitor.accept({ ts: 'now', level: 'info', event: 'http_request', path: '/healthz', status: 200 })
    expect(monitor.getStatus().phase).toBe('waiting-request')

    monitor.accept({ ts: 'now', level: 'info', event: 'http_request', path: '/mcp', status: 401 })
    expect(monitor.getStatus().phase).toBe('waiting-authorization')

    monitor.accept({ ts: 'now', level: 'info', event: 'mcp_session_created' })
    expect(monitor.getStatus()).toMatchObject({ phase: 'connected' })
  })

  it('restores the locally authorized state from Core instead of Desktop history', () => {
    const monitor = new ChatGPTConnectionMonitor()
    monitor.accept({ ts: 'now', level: 'info', event: 'oauth_authorization_state', authorizedClientCount: 1 })

    expect(monitor.getStatus()).toEqual({ phase: 'configured', lastConnectedAt: null })
  })

  it('lets an authorized client start a real reconnect attempt', () => {
    const monitor = new ChatGPTConnectionMonitor()
    monitor.setPrerequisites(true)
    monitor.accept({ ts: 'now', level: 'info', event: 'oauth_authorization_state', authorizedClientCount: 1 })

    monitor.beginSetup()
    monitor.setPrerequisites(true)

    expect(monitor.getStatus()).toEqual({ phase: 'waiting-request', lastConnectedAt: null })
    monitor.dispose()
  })

  it('detects that ChatGPT reached the browser authorization flow', () => {
    const monitor = new ChatGPTConnectionMonitor()
    monitor.setPrerequisites(true)
    monitor.accept({
      ts: 'now',
      level: 'info',
      event: 'http_request',
      path: '/',
      status: 200,
      referer: 'https://chatgpt.com/'
    })

    expect(monitor.getStatus().phase).toBe('waiting-authorization')
    monitor.dispose()
  })

  it('reports a failed reconnect when no MCP session appears before the time limit', () => {
    vi.useFakeTimers()
    const monitor = new ChatGPTConnectionMonitor({ reconnectTimeoutMs: 90_000 })
    monitor.setPrerequisites(true)
    monitor.beginSetup()

    vi.advanceTimersByTime(90_000)

    expect(monitor.getStatus()).toEqual({ phase: 'stale', lastConnectedAt: null })
    monitor.dispose()
  })

  it('returns to configured when the active MCP session closes', () => {
    const monitor = new ChatGPTConnectionMonitor({ now: () => 0 })
    monitor.setPrerequisites(true)
    monitor.accept({ ts: 'now', level: 'info', event: 'oauth_authorization_state', authorizedClientCount: 1 })
    monitor.accept({ ts: 'now', level: 'info', event: 'mcp_session_created', sessionIdPrefix: 'session-1' })
    monitor.accept({ ts: 'now', level: 'info', event: 'mcp_session_closed', sessionIdPrefix: 'session-1' })

    expect(monitor.getStatus()).toEqual({ phase: 'configured', lastConnectedAt: '1970-01-01T00:00:00.000Z' })
  })

  it('keeps the independently verified authorization state when Core becomes unavailable', () => {
    const monitor = new ChatGPTConnectionMonitor({ now: () => 0 })
    monitor.setPrerequisites(true)
    monitor.accept({ ts: 'now', level: 'info', event: 'oauth_authorization_state', authorizedClientCount: 1 })
    monitor.accept({ ts: 'now', level: 'info', event: 'mcp_session_created' })

    monitor.setPrerequisites(false)

    expect(monitor.getStatus()).toEqual({ phase: 'configured', lastConnectedAt: '1970-01-01T00:00:00.000Z' })
  })
})
