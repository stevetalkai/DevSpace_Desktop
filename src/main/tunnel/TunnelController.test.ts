import { describe, expect, it, vi } from 'vitest'
import type { TunnelProvider } from './TunnelProvider'
import { TunnelController } from './TunnelController'

function provider(overrides: Partial<TunnelProvider> = {}): TunnelProvider {
  return {
    id: 'fake',
    name: 'Fake tunnel',
    detect: async () => ({ cliInstalled: true, daemonAvailable: true, loggedIn: true, online: true, dnsName: 'mac.ts.net', errorCode: null }),
    status: async () => ({ state: 'stopped', localPort: null, publicUrl: null, errorCode: null }),
    start: async (localPort) => ({ providerId: 'fake', localPort, publicUrl: 'https://mac.ts.net/mcp' }),
    stop: async () => undefined,
    ...overrides
  }
}

const runningCore = () => ({ phase: 'running', port: 7676, startedAt: '2026-09-02T00:00:00.000Z', errorCode: null } as const)

describe('TunnelController', () => {
  it('maps a stopped provider to ready', async () => {
    const controller = new TunnelController(provider(), runningCore)
    await expect(controller.detect()).resolves.toMatchObject({ phase: 'ready', mcpUrl: null })
  })

  it('maps an unavailable daemon to a user-facing phase', async () => {
    const controller = new TunnelController(provider({
      detect: async () => ({ cliInstalled: true, daemonAvailable: false, loggedIn: false, online: false, dnsName: null, errorCode: 'daemon_unavailable' })
    }), runningCore)
    await expect(controller.detect()).resolves.toMatchObject({ phase: 'daemon-unavailable', errorCode: 'daemon_unavailable' })
  })

  it('starts the provider on the Core port and retains both URLs', async () => {
    const start = vi.fn(async (port: number) => ({ providerId: 'fake', localPort: port, publicUrl: 'https://mac.ts.net/mcp' }))
    const controller = new TunnelController(provider({ start }), runningCore)

    const status = await controller.start()

    expect(start).toHaveBeenCalledWith(7676)
    expect(status).toEqual({ phase: 'connected', publicUrl: 'https://mac.ts.net', mcpUrl: 'https://mac.ts.net/mcp', errorCode: null })
  })

  it('does not start a public tunnel before Core is running', async () => {
    const start = vi.fn()
    const controller = new TunnelController(provider({ start }), () => ({ phase: 'stopped', port: 7676, startedAt: null, errorCode: null }))

    await expect(controller.start()).resolves.toMatchObject({ phase: 'failed', errorCode: 'core_not_running' })
    expect(start).not.toHaveBeenCalled()
  })
})
