import { describe, expect, it, vi } from 'vitest'
import { TailscaleTunnelProvider, type CommandExecutor, type CommandResult } from './TailscaleTunnelProvider'
import { TunnelProviderError } from './TunnelProvider'

const onlineStatus = JSON.stringify({
  BackendState: 'Running',
  CurrentTailnet: { Name: 'example' },
  Self: { Online: true, DNSName: 'desktop.tailnet.ts.net.' }
})

const funnelStatus = JSON.stringify({
  Web: {
    'desktop.tailnet.ts.net:443': {
      Handlers: { '/': { Proxy: 'http://127.0.0.1:7676' } }
    }
  },
  AllowFunnel: { 'desktop.tailnet.ts.net:443': true }
})

const reachable = async (): Promise<'reachable'> => 'reachable'

function success(stdout = ''): CommandResult {
  return { stdout, stderr: '' }
}

function commandError(message: string, properties: Record<string, unknown> = {}): Error {
  return Object.assign(new Error(message), properties)
}

describe('TailscaleTunnelProvider.detect', () => {
  it('reports an installed, logged-in, online environment', async () => {
    const execute = vi.fn<CommandExecutor>()
      .mockResolvedValueOnce(success('1.88.0'))
      .mockResolvedValueOnce(success(onlineStatus))
    const provider = new TailscaleTunnelProvider({ execute, executablePath: '/opt/bin/tailscale' })

    await expect(provider.detect()).resolves.toEqual({
      cliInstalled: true,
      daemonAvailable: true,
      loggedIn: true,
      online: true,
      dnsName: 'desktop.tailnet.ts.net',
      errorCode: null
    })
    expect(execute).toHaveBeenNthCalledWith(1, '/opt/bin/tailscale', ['version'], { timeoutMs: 10_000 })
    expect(execute).toHaveBeenNthCalledWith(2, '/opt/bin/tailscale', ['status', '--json'], { timeoutMs: 10_000 })
  })

  it('resolves the executable path again after Tailscale is installed', async () => {
    let installed = false
    const execute = vi.fn<CommandExecutor>()
      .mockRejectedValueOnce(commandError('spawn failed', { code: 'ENOENT' }))
      .mockResolvedValueOnce(success('1.102.3'))
      .mockResolvedValueOnce(success(onlineStatus))
    const provider = new TailscaleTunnelProvider({
      execute,
      executablePath: () => installed ? 'C:\\Program Files\\Tailscale\\tailscale.exe' : 'tailscale'
    })

    await expect(provider.detect()).resolves.toMatchObject({ cliInstalled: false, errorCode: 'cli_missing' })
    installed = true
    await expect(provider.detect()).resolves.toMatchObject({ cliInstalled: true, online: true, errorCode: null })
    expect(execute).toHaveBeenLastCalledWith(
      'C:\\Program Files\\Tailscale\\tailscale.exe',
      ['status', '--json'],
      { timeoutMs: 10_000 }
    )
  })

  it.each([
    ['cli_missing', commandError('spawn failed', { code: 'ENOENT' }), false],
    ['timeout', commandError('timed out', { killed: true }), true]
  ] as const)('maps version failures to %s', async (errorCode, error, cliInstalled) => {
    const provider = new TailscaleTunnelProvider({ execute: vi.fn<CommandExecutor>().mockRejectedValue(error) })
    await expect(provider.detect()).resolves.toMatchObject({ errorCode, cliInstalled, online: false })
  })

  it.each([
    'failed to connect to local Tailscale service',
    'dial unix /var/run/tailscaled.socket: connect: no such file'
  ])('recognizes an unavailable daemon: %s', async (message) => {
    const execute = vi.fn<CommandExecutor>().mockResolvedValueOnce(success('1.88.0')).mockRejectedValueOnce(commandError(message))
    const provider = new TailscaleTunnelProvider({ execute })
    await expect(provider.detect()).resolves.toMatchObject({
      cliInstalled: true,
      daemonAvailable: false,
      errorCode: 'daemon_unavailable'
    })
  })

  it('reports logged-out and offline states separately', async () => {
    const loggedOut = new TailscaleTunnelProvider({
      checkConnectivity: reachable,
      execute: vi
        .fn<CommandExecutor>()
        .mockResolvedValueOnce(success('version'))
        .mockResolvedValueOnce(success(JSON.stringify({ BackendState: 'NeedsLogin' })))
    })
    await expect(loggedOut.detect()).resolves.toMatchObject({ errorCode: 'not_logged_in', loggedIn: false })

    const offline = new TailscaleTunnelProvider({
      checkConnectivity: reachable,
      execute: vi
        .fn<CommandExecutor>()
        .mockResolvedValueOnce(success('version'))
        .mockResolvedValueOnce(
          success(JSON.stringify({ BackendState: 'Stopped', CurrentTailnet: {}, Self: { Online: false } }))
        )
    })
    await expect(offline.detect()).resolves.toMatchObject({ errorCode: 'offline', loggedIn: true, online: false })
  })

  it.each([
    ['proxy_dns_conflict', 'proxy_dns_conflict'],
    ['coordination_unavailable', 'coordination_unavailable']
  ] as const)('reports %s before asking the user to sign in', async (_name, result) => {
    const provider = new TailscaleTunnelProvider({
      checkConnectivity: async () => result,
      execute: vi
        .fn<CommandExecutor>()
        .mockResolvedValueOnce(success('version'))
        .mockResolvedValueOnce(success(JSON.stringify({ BackendState: 'NeedsLogin' })))
    })
    await expect(provider.detect()).resolves.toMatchObject({ errorCode: result, daemonAvailable: true })
  })

  it('returns invalid_output for malformed status JSON', async () => {
    const execute = vi.fn<CommandExecutor>().mockResolvedValueOnce(success('version')).mockResolvedValueOnce(success('{'))
    await expect(new TailscaleTunnelProvider({ execute }).detect()).resolves.toMatchObject({ errorCode: 'invalid_output' })
  })
})

describe('TailscaleTunnelProvider funnel operations', () => {
  it('reads JSON status and normalizes the public URL to /mcp', async () => {
    const execute = vi
      .fn<CommandExecutor>()
      .mockResolvedValueOnce(success('version'))
      .mockResolvedValueOnce(success(onlineStatus))
      .mockResolvedValueOnce(success(funnelStatus))

    await expect(new TailscaleTunnelProvider({ execute }).status()).resolves.toEqual({
      state: 'running',
      localPort: 7676,
      publicUrl: 'https://desktop.tailnet.ts.net/mcp',
      errorCode: null
    })
  })

  it('falls back to conservative text parsing when --json is unavailable', async () => {
    const execute = vi
      .fn<CommandExecutor>()
      .mockResolvedValueOnce(success('version'))
      .mockResolvedValueOnce(success(onlineStatus))
      .mockRejectedValueOnce(commandError('unknown flag: --json'))
      .mockResolvedValueOnce(
        success('Available on the internet:\nhttps://desktop.tailnet.ts.net/\n|-- proxy http://localhost:7676')
      )
    const provider = new TailscaleTunnelProvider({ execute })

    await expect(provider.status()).resolves.toMatchObject({ state: 'running', localPort: 7676 })
    expect(execute.mock.calls.at(-1)?.[1]).toEqual(['funnel', 'status'])
  })

  it('reports invalid text instead of guessing a tunnel state', async () => {
    const execute = vi
      .fn<CommandExecutor>()
      .mockResolvedValueOnce(success('version'))
      .mockResolvedValueOnce(success(onlineStatus))
      .mockRejectedValueOnce(commandError('unknown flag: --json'))
      .mockResolvedValueOnce(success('An unfamiliar future output format'))
    await expect(new TailscaleTunnelProvider({ execute }).status()).resolves.toMatchObject({
      state: 'error',
      errorCode: 'invalid_output'
    })
  })

  it('starts with argument arrays, then reads status before returning', async () => {
    const execute = vi
      .fn<CommandExecutor>()
      .mockResolvedValueOnce(success('version'))
      .mockResolvedValueOnce(success(onlineStatus))
      .mockResolvedValueOnce(success())
      .mockResolvedValueOnce(success('version'))
      .mockResolvedValueOnce(success(onlineStatus))
      .mockResolvedValueOnce(success(funnelStatus))
    const provider = new TailscaleTunnelProvider({ execute, executablePath: '/Applications/Tailscale CLI; touch /tmp/bad' })

    await expect(provider.start(7676)).resolves.toEqual({
      providerId: 'tailscale',
      localPort: 7676,
      publicUrl: 'https://desktop.tailnet.ts.net/mcp'
    })
    expect(execute).toHaveBeenNthCalledWith(
      3,
      '/Applications/Tailscale CLI; touch /tmp/bad',
      ['funnel', '--bg', '--yes', '7676'],
      { timeoutMs: 10_000 }
    )
    expect(execute.mock.calls[5]?.[1]).toEqual(['funnel', 'status', '--json'])
  })

  it('rejects injected port text before executing any command', async () => {
    const execute = vi.fn<CommandExecutor>()
    const provider = new TailscaleTunnelProvider({ execute })

    await expect(provider.start('7676; touch /tmp/bad' as unknown as number)).rejects.toMatchObject({
      code: 'funnel_failed'
    })
    expect(execute).not.toHaveBeenCalled()
  })

  it('stops only the requested port and never resets all configuration', async () => {
    const execute = vi.fn<CommandExecutor>().mockResolvedValue(success())
    await new TailscaleTunnelProvider({ execute }).stop(7676)

    expect(execute).toHaveBeenCalledWith('tailscale', ['funnel', '--bg', '--yes', '7676', 'off'], { timeoutMs: 10_000 })
    expect(execute.mock.calls.flatMap((call) => call[1])).not.toContain('reset')
  })

  it.each([
    ['timeout', commandError('timed out', { code: 'ETIMEDOUT' })],
    ['unsupported', commandError('Funnel is not supported on this client')],
    ['funnel_failed', commandError('permission denied')]
  ] as const)('maps start failures to %s', async (code, error) => {
    const execute = vi
      .fn<CommandExecutor>()
      .mockResolvedValueOnce(success('version'))
      .mockResolvedValueOnce(success(onlineStatus))
      .mockRejectedValueOnce(error)
    const provider = new TailscaleTunnelProvider({ execute })

    const operation = provider.start(7676)
    await expect(operation).rejects.toBeInstanceOf(TunnelProviderError)
    await expect(operation).rejects.toMatchObject({ code })
  })
})
