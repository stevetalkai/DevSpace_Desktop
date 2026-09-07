import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { findHomebrew } from './HomebrewDetection'
import { findTailscaleExecutable } from './TailscaleExecutable'

export function setupCommand(action: unknown, source: unknown, platform: string, brew: string | null, cli: string): string {
  if (!['install', 'service', 'login'].includes(String(action)) || !['official', 'ustc'].includes(String(source))) throw new Error('Invalid setup action')
  if (platform === 'win32') {
    if (action === 'install') return 'winget install --id Tailscale.Tailscale --exact'
    if (action === 'service') return "Start-Service -Name 'Tailscale'"
    return "& '" + cli.replace(/'/g, "''") + "' login"
  }
  if (platform !== 'darwin') throw new Error('Unsupported platform')
  const quote = (text: string): string => "'" + text.replace(/'/g, "'\\''") + "'"
  if (action === 'login') return quote(cli) + ' login'
  if (action === 'service') {
    if (!brew) throw new Error('Homebrew not installed')
    return 'sudo ' + quote(brew) + ' services start tailscale'
  }
  const mirror = source === 'ustc'
    ? 'HOMEBREW_BREW_GIT_REMOTE=https://mirrors.ustc.edu.cn/brew.git HOMEBREW_BOTTLE_DOMAIN=https://mirrors.ustc.edu.cn/homebrew-bottles HOMEBREW_API_DOMAIN=https://mirrors.ustc.edu.cn/homebrew-bottles/api '
    : ''
  if (brew) return mirror + quote(brew) + ' install --formula tailscale'
  const url = source === 'ustc' ? 'https://mirrors.ustc.edu.cn/misc/brew-install.sh' : 'https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh'
  return mirror + '/bin/bash -c "$(curl -fsSL ' + url + ')"'
}

export function terminalInvocation(platform: string, command: string): { executable: string; args: string[] } {
  if (platform === 'darwin') {
    const escaped = command.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n')
    return { executable: '/usr/bin/osascript', args: ['-e', 'tell application "Terminal"\nactivate\ndo script "' + escaped + '"\nend tell'] }
  }
  if (platform !== 'win32') throw new Error('Unsupported platform')
  const encoded = Buffer.from(command, 'utf16le').toString('base64')
  return {
    executable: 'powershell.exe',
    args: ['-NoProfile', '-NonInteractive', '-Command', "Start-Process powershell.exe -Verb RunAs -ArgumentList '-NoProfile -NoExit -EncodedCommand " + encoded + "'"]
  }
}

export async function runTailscaleCommand(action: unknown, source: unknown): Promise<void> {
  const cli = action === 'login' ? findTailscaleExecutable() : ''
  const command = setupCommand(action, source, process.platform, findHomebrew(), cli)
  const invocation = terminalInvocation(process.platform, command)
  await promisify(execFile)(invocation.executable, invocation.args, { timeout: 15_000 })
}
