import { execFile } from 'node:child_process'
import {
  TunnelProviderError,
  type TunnelEnvironment,
  type TunnelErrorCode,
  type TunnelInfo,
  type TunnelProvider,
  type TunnelStatus
} from './TunnelProvider'
import { parseFunnelJson, parseFunnelText, parseTailscaleStatus } from './TailscaleStatusParser'
import { checkTailscaleConnectivity, type TailscaleConnectivityResult } from './TailscaleConnectivityCheck'

export interface CommandResult {
  stdout: string
  stderr: string
}

export interface CommandOptions {
  timeoutMs: number
}

export type CommandExecutor = (executable: string, arguments_: readonly string[], options: CommandOptions) => Promise<CommandResult>

export interface TailscaleTunnelProviderOptions {
  executablePath?: string | (() => string)
  execute?: CommandExecutor
  checkConnectivity?: () => Promise<TailscaleConnectivityResult>
  timeoutMs?: number
}

export class TailscaleTunnelProvider implements TunnelProvider {
  readonly id = 'tailscale'
  readonly name = 'Tailscale Funnel'

  private readonly resolveExecutablePath: () => string
  private readonly execute: CommandExecutor
  private readonly checkConnectivity: () => Promise<TailscaleConnectivityResult>
  private readonly timeoutMs: number

  constructor(options: TailscaleTunnelProviderOptions = {}) {
    const executablePath = options.executablePath
    this.resolveExecutablePath = typeof executablePath === 'function'
      ? executablePath
      : () => executablePath ?? 'tailscale'
    this.execute = options.execute ?? executeFile
    this.checkConnectivity = options.checkConnectivity ?? checkTailscaleConnectivity
    this.timeoutMs = options.timeoutMs ?? 10_000
  }

  async detect(): Promise<TunnelEnvironment> {
    try {
      await this.run(['version'])
    } catch (error) {
      const code = errorCodeFor(error)
      return unavailableEnvironment(code === 'cli_missing' ? code : code === 'timeout' ? code : 'daemon_unavailable', code !== 'cli_missing')
    }

    let statusOutput: string
    try {
      statusOutput = (await this.execute(this.resolveExecutablePath(), ['status', '--json'], { timeoutMs: Math.min(this.timeoutMs, 3_000) })).stdout
    } catch (error) {
      return unavailableEnvironment(errorCodeFor(error), true)
    }

    try {
      const parsed = parseTailscaleStatus(statusOutput)
      if (!parsed.online) {
        const connectivity = await this.checkConnectivity()
        if (connectivity !== 'reachable') return { cliInstalled: true, ...parsed, errorCode: connectivity }
      }
      const errorCode: TunnelErrorCode | null = !parsed.loggedIn ? 'not_logged_in' : !parsed.online ? 'offline' : null
      return { cliInstalled: true, ...parsed, errorCode }
    } catch {
      return {
        cliInstalled: true,
        daemonAvailable: true,
        loggedIn: false,
        online: false,
        dnsName: null,
        errorCode: 'invalid_output'
      }
    }
  }

  async status(): Promise<TunnelStatus> {
    const environment = await this.detect()
    if (environment.errorCode) return errorStatus(environment.errorCode)

    try {
      const jsonResult = await this.run(['funnel', 'status', '--json'])
      try {
        return parseFunnelJson(jsonResult.stdout)
      } catch {
        return await this.readTextStatus()
      }
    } catch (error) {
      const code = errorCodeFor(error)
      const output = errorOutput(error)
      if (isStoppedText(output)) return stoppedStatus()
      if (isJsonFlagUnsupported(error)) return this.readTextStatus()
      return errorStatus(code)
    }
  }

  async start(localPort: number): Promise<TunnelInfo> {
    assertPort(localPort)
    const environment = await this.detect()
    if (environment.errorCode) throw providerError(environment.errorCode)

    try {
      await this.run(['funnel', '--bg', '--yes', String(localPort)])
    } catch (error) {
      throw asProviderError(error)
    }

    const status = await this.status()
    if (status.state !== 'running' || status.localPort !== localPort || !status.publicUrl) {
      throw providerError(status.errorCode ?? 'funnel_failed')
    }
    return { providerId: this.id, localPort, publicUrl: status.publicUrl }
  }

  async stop(localPort: number): Promise<void> {
    assertPort(localPort)
    try {
      await this.run(['funnel', '--bg', '--yes', String(localPort), 'off'])
    } catch (error) {
      throw asProviderError(error)
    }
  }

  private async readTextStatus(): Promise<TunnelStatus> {
    try {
      const result = await this.run(['funnel', 'status'])
      try {
        return parseFunnelText(result.stdout)
      } catch {
        return errorStatus('invalid_output')
      }
    } catch (error) {
      if (isStoppedText(errorOutput(error))) return stoppedStatus()
      return errorStatus(errorCodeFor(error))
    }
  }

  private run(arguments_: readonly string[]): Promise<CommandResult> {
    return this.execute(this.resolveExecutablePath(), arguments_, { timeoutMs: this.timeoutMs })
  }
}

function executeFile(executable: string, arguments_: readonly string[], options: CommandOptions): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    execFile(executable, [...arguments_], {
      windowsHide: true,
      timeout: options.timeoutMs,
      killSignal: 'SIGKILL',
      maxBuffer: 1024 * 1024,
      env: process.platform === 'darwin' ? { ...process.env, TAILSCALE_BE_CLI: '1' } : process.env
    }, (error, stdout, stderr) => {
      if (error) {
        Object.assign(error, { stdout, stderr })
        reject(error)
        return
      }
      resolve({ stdout, stderr })
    })
  })
}

function unavailableEnvironment(errorCode: TunnelErrorCode, cliInstalled: boolean): TunnelEnvironment {
  return {
    cliInstalled,
    daemonAvailable: false,
    loggedIn: false,
    online: false,
    dnsName: null,
    errorCode
  }
}

function errorStatus(errorCode: TunnelErrorCode): TunnelStatus {
  return { state: 'error', localPort: null, publicUrl: null, errorCode }
}

function stoppedStatus(): TunnelStatus {
  return { state: 'stopped', localPort: null, publicUrl: null, errorCode: null }
}

function assertPort(port: number): void {
  if (!Number.isInteger(port) || port < 1 || port > 65_535) throw providerError('funnel_failed')
}

function asProviderError(error: unknown): TunnelProviderError {
  if (error instanceof TunnelProviderError) return error
  return providerError(errorCodeFor(error), error)
}

function providerError(code: TunnelErrorCode, cause?: unknown): TunnelProviderError {
  return new TunnelProviderError(code, `Tailscale operation failed: ${code}`, cause === undefined ? undefined : { cause })
}

function errorCodeFor(error: unknown): TunnelErrorCode {
  if (error instanceof TunnelProviderError) return error.code
  if (isNodeError(error) && error.code === 'ENOENT') return 'cli_missing'
  if (isNodeError(error) && (error.code === 'ETIMEDOUT' || error.killed === true)) return 'timeout'

  const output = errorOutput(error)
  if (/not logged in|logged out|needs? login|login.tailscale.com/i.test(output)) return 'not_logged_in'
  if (
    /failed to connect to local tailscale service|failed to connect|cannot connect|tailscaled.*not running|tailscaled\.socket|daemon.*unavailable|no such file.*tailscaled/i.test(
      output
    )
  ) {
    return 'daemon_unavailable'
  }
  if (/backend.*stopped|network is unreachable|offline/i.test(output)) return 'offline'
  if (/not supported|unsupported|unknown command.*funnel|funnel.*unavailable/i.test(output)) return 'unsupported'
  if (/unknown flag.*json|flag provided but not defined.*json/i.test(output)) return 'unsupported'
  return 'funnel_failed'
}

function isJsonFlagUnsupported(error: unknown): boolean {
  return /unknown flag.*json|flag provided but not defined.*json/i.test(errorOutput(error))
}

function isStoppedText(output: string): boolean {
  return /no (serve|funnel) config|not (currently )?(serving|funneling)|funnel is off/i.test(output)
}

function errorOutput(error: unknown): string {
  if (!isNodeError(error)) return String(error)
  const stdout = typeof error.stdout === 'string' ? error.stdout : ''
  const stderr = typeof error.stderr === 'string' ? error.stderr : ''
  return `${error.message}\n${stdout}\n${stderr}`
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException & {
  killed?: boolean
  stdout?: string
  stderr?: string
} {
  return error instanceof Error
}
