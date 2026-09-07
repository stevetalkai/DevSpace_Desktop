import { describe, expect, it } from 'vitest'
import { setupCommand, terminalInvocation } from './TailscaleTerminalCommand'

describe('Tailscale terminal commands', () => {
  it('only accepts supported actions and sources', () => {
    expect(() => setupCommand('rm', 'official', 'darwin', null, '')).toThrow()
    expect(() => setupCommand('install', 'untrusted', 'darwin', null, '')).toThrow()
  })
  it('installs Homebrew first and preserves the selected mirror', () => {
    expect(setupCommand('install', 'ustc', 'darwin', null, '')).toContain('mirrors.ustc.edu.cn/misc/brew-install.sh')
    expect(setupCommand('install', 'official', 'darwin', '/opt/homebrew/bin/brew', '')).toBe("'/opt/homebrew/bin/brew' install --formula tailscale")
  })
  it('starts the detected Homebrew service with sudo', () => {
    expect(setupCommand('service', 'official', 'darwin', '/usr/local/bin/brew', '')).toBe("sudo '/usr/local/bin/brew' services start tailscale")
    expect(() => setupCommand('service', 'official', 'darwin', null, '')).toThrow()
  })
  it('opens Terminal with the command', () => {
    const invocation = terminalInvocation('darwin', 'tailscale login')
    expect(invocation.executable).toBe('/usr/bin/osascript')
    expect(invocation.args[1]).toContain('do script "tailscale login"')
  })
  it('opens an elevated PowerShell and preserves the complete command', () => {
    const command = setupCommand('login', 'official', 'win32', null, 'C:\\Program Files\\Tailscale\\tailscale.exe')
    expect(command).toBe("& 'C:\\Program Files\\Tailscale\\tailscale.exe' login")
    const invocation = terminalInvocation('win32', command)
    expect(invocation.args.join(' ')).toContain('-Verb RunAs')
    expect(invocation.args.join(' ')).toContain(Buffer.from(command, 'utf16le').toString('base64'))
    expect(setupCommand('service', 'official', 'win32', null, '')).toBe("Start-Service -Name 'Tailscale'")
  })
})
