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

  it('marks an inactive connection as stale', () => {
    vi.useFakeTimers()
    const monitor = new ChatGPTConnectionMonitor({ staleAfterMs: 1_000, now: () => 0 })
    monitor.setPrerequisites(true)
    monitor.accept({ ts: 'now', level: 'info', event: 'mcp_session_created' })
    vi.advanceTimersByTime(1_000)
    expect(monitor.getStatus()).toEqual({ phase: 'stale', lastConnectedAt: '1970-01-01T00:00:00.000Z' })
  })
})
