import { describe, expect, it, vi } from 'vitest'
import { openTailscaleClient, terminalCommand } from './TailscaleClientLauncher'

describe('TailscaleClientLauncher', () => {
  it('does not open a macOS desktop app as a command-line client', async () => {
    const openPath = vi.fn(async () => '')
    const runCommand = vi.fn(async () => undefined)

    await expect(openTailscaleClient({
      platform: 'darwin',
      applicationPath: '/Applications/Tailscale.app',
      executablePath: '/Applications/Tailscale.app/Contents/MacOS/Tailscale',
      phase: 'daemon-unavailable',
      openPath,
      runCommand
    })).resolves.toBe(false)
    expect(openPath).not.toHaveBeenCalled()
    expect(runCommand).not.toHaveBeenCalled()
  })

  it('starts a Homebrew background service from Terminal', async () => {
    expect(terminalCommand('/opt/homebrew/bin/tailscale', 'daemon-unavailable'))
      .toBe("sudo '/opt/homebrew/bin/brew' services start tailscale")
  })

  it('starts command-line sign-in from Terminal', async () => {
    expect(terminalCommand('/usr/local/bin/tailscale', 'not-logged-in'))
      .toBe("'/usr/local/bin/tailscale' login --timeout=30s || printf '\\nTailscale 登录连接超时。请检查代理软件设置后重试。\\n'")
  })
})
