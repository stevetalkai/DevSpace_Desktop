import type { TunnelPhase } from '../../shared/contracts'

export type CommandRunner = (executable: string, arguments_: readonly string[]) => Promise<void>

export interface TailscaleClientLauncherOptions {
  platform: NodeJS.Platform
  applicationPath: string | null
  executablePath: string
  phase: TunnelPhase
  openPath: (path: string) => Promise<string>
  runCommand: CommandRunner
}

export async function openTailscaleClient(options: TailscaleClientLauncherOptions): Promise<boolean> {
  if (options.applicationPath) return (await options.openPath(options.applicationPath)) === ''
  if (options.platform !== 'darwin') return false

  const command = terminalCommand(options.executablePath, options.phase)
  if (!command) return false

  const script = `tell application "Terminal"\nactivate\ndo script "${escapeAppleScriptString(command)}"\nend tell`
  await options.runCommand('/usr/bin/osascript', ['-e', script])
  return true
}

export function terminalCommand(executablePath: string, phase: TunnelPhase): string | null {
  if (phase === 'not-logged-in' || phase === 'offline') {
    return `${quoteShellArgument(executablePath)} login --timeout=30s || printf '\\nTailscale 登录连接超时。请检查代理软件设置后重试。\\n'`
  }
  if (phase !== 'daemon-unavailable') return null

  const brewPath = executablePath.startsWith('/opt/homebrew/')
    ? '/opt/homebrew/bin/brew'
    : executablePath.startsWith('/usr/local/')
      ? '/usr/local/bin/brew'
      : null
  return brewPath ? `sudo ${quoteShellArgument(brewPath)} services start tailscale` : null
}

function quoteShellArgument(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`
}

function escapeAppleScriptString(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}
