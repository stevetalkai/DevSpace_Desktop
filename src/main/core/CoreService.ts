import { EventEmitter } from 'node:events'
import { randomBytes } from 'node:crypto'
import { request } from 'node:http'
import { dirname, join } from 'node:path'
import { createRequire } from 'node:module'
import { spawn, type ChildProcess } from 'node:child_process'
import type { CoreStatus } from '../../shared/contracts'
import { writeCoreConfiguration } from './CoreConfiguration'
import { parseCoreStructuredEvent } from '../chatgpt/ChatGPTConnectionMonitor'

type SpawnCore = (cliPath: string, port: number, environment: NodeJS.ProcessEnv) => ChildProcess
type ProbeHealth = (port: number, timeoutMs: number) => Promise<boolean>

export interface CoreServiceOptions {
  port?: number
  startupTimeoutMs?: number
  spawnCore?: SpawnCore
  probePort?: ProbeHealth
  resolveCli?: () => string
  allowedRoots?: string[]
  fallbackRoot?: string
  ownerToken?: string
  configDirectory?: string
}

const initialStatus = (port: number): CoreStatus => ({
  phase: 'stopped',
  port,
  startedAt: null,
  errorCode: null
})

export class CoreService extends EventEmitter {
  private readonly port: number
  private readonly startupTimeoutMs: number
  private readonly spawnCore: SpawnCore
  private readonly probePort: ProbeHealth
  private readonly resolveCli: () => string
  private readonly environment: NodeJS.ProcessEnv
  private readonly fallbackRoot: string
  private readonly configDirectory: string | null
  private allowedRoots: string[]
  private publicBaseUrl: string | null = null
  private process: ChildProcess | null = null
  private status: CoreStatus
  private startPromise: Promise<CoreStatus> | null = null
  private intentionallyStopping = false

  constructor(options: CoreServiceOptions = {}) {
    super()
    this.port = options.port ?? 7676
    this.startupTimeoutMs = options.startupTimeoutMs ?? 15_000
    this.spawnCore = options.spawnCore ?? defaultSpawnCore
    this.probePort = options.probePort ?? probeLocalPort
    this.resolveCli = options.resolveCli ?? resolveCoreCli
    this.fallbackRoot = options.fallbackRoot ?? options.allowedRoots?.[0] ?? process.cwd()
    this.configDirectory = options.configDirectory ?? null
    this.allowedRoots = options.allowedRoots ?? [this.fallbackRoot]
    this.environment = {
      HOST: '127.0.0.1',
      PORT: String(this.port),
      DEVSPACE_LOG_LEVEL: 'debug',
      DEVSPACE_LOG_FORMAT: 'json',
      DEVSPACE_LOG_REQUESTS: '1',
      DEVSPACE_OAUTH_OWNER_TOKEN: options.ownerToken ?? randomBytes(32).toString('hex'),
      ...(this.configDirectory
        ? { DEVSPACE_CONFIG_DIR: this.configDirectory }
        : { DEVSPACE_ALLOWED_ROOTS: this.allowedRoots.join(',') })
    }
    this.status = initialStatus(this.port)
  }

  getStatus(): CoreStatus {
    return { ...this.status }
  }

  async replaceAllowedRoots(roots: string[]): Promise<CoreStatus> {
    if (this.status.phase === 'starting') await this.start()
    const shouldRestart = this.status.phase === 'running'
    if (shouldRestart) await this.stop()
    this.allowedRoots = roots.length > 0 ? [...roots] : [this.fallbackRoot]
    if (!this.configDirectory) this.environment.DEVSPACE_ALLOWED_ROOTS = this.allowedRoots.join(',')
    return shouldRestart ? this.start() : this.getStatus()
  }

  async replacePublicBaseUrl(publicBaseUrl: string | null): Promise<CoreStatus> {
    if (this.publicBaseUrl === publicBaseUrl) return this.getStatus()
    if (this.status.phase === 'starting') await this.start()
    const shouldRestart = this.status.phase === 'running'
    if (shouldRestart) await this.stop()
    this.publicBaseUrl = publicBaseUrl
    return shouldRestart ? this.start() : this.getStatus()
  }

  async start(): Promise<CoreStatus> {
    if (this.status.phase === 'running') return this.getStatus()
    if (this.startPromise) return this.startPromise

    this.startPromise = this.performStart()
    try {
      return await this.startPromise
    } finally {
      this.startPromise = null
    }
  }

  private async performStart(): Promise<CoreStatus> {
    this.intentionallyStopping = false
    this.update({ phase: 'starting', startedAt: null, errorCode: null })

    let cliPath: string
    try {
      if (this.configDirectory) await writeCoreConfiguration(this.configDirectory, this.port, this.allowedRoots, this.publicBaseUrl)
      cliPath = this.resolveCli()
      this.process = this.spawnCore(cliPath, this.port, this.environment)
      this.observeCoreOutput(this.process.stdout)
      this.observeCoreOutput(this.process.stderr)
    } catch {
      return this.fail('core_launch_failed')
    }

    this.process.once('exit', (code, signal) => {
      this.process = null
      if (this.intentionallyStopping) return
      const errorCode = code === 0 && signal === null ? 'core_stopped_unexpectedly' : 'core_crashed'
      this.fail(errorCode)
    })
    this.process.once('error', () => this.fail('core_launch_failed'))

    const deadline = Date.now() + this.startupTimeoutMs
    while (Date.now() < deadline) {
      if (!this.process) return this.getStatus()
      if (await this.probePort(this.port, 500)) {
        this.update({ phase: 'running', startedAt: new Date().toISOString(), errorCode: null })
        return this.getStatus()
      }
      await delay(250)
    }

    await this.stopProcess()
    return this.fail('core_start_timeout')
  }

  async stop(): Promise<CoreStatus> {
    if (!this.process && this.status.phase === 'stopped') return this.getStatus()
    this.intentionallyStopping = true
    this.update({ phase: 'stopping', errorCode: null })
    await this.stopProcess()
    this.update({ phase: 'stopped', startedAt: null, errorCode: null })
    return this.getStatus()
  }

  private async stopProcess(): Promise<void> {
    const child = this.process
    if (!child) return

    await new Promise<void>((resolve) => {
      const timeout = setTimeout(() => {
        child.kill('SIGKILL')
        resolve()
      }, 3_000)
      child.once('exit', () => {
        clearTimeout(timeout)
        resolve()
      })
      child.kill('SIGTERM')
    })
    if (this.process === child) this.process = null
  }

  private fail(errorCode: string): CoreStatus {
    this.update({ phase: 'failed', startedAt: null, errorCode })
    return this.getStatus()
  }

  private observeCoreOutput(stream: NodeJS.ReadableStream | null): void {
    if (!stream) return
    let remainder = ''
    stream.on('data', (chunk: Buffer | string) => {
      remainder += chunk.toString()
      const lines = remainder.split(/\r?\n/u)
      remainder = lines.pop() ?? ''
      for (const line of lines) {
        const event = parseCoreStructuredEvent(line)
        if (event) this.emit('core-event', event)
      }
    })
  }

  private update(patch: Partial<CoreStatus>): void {
    this.status = { ...this.status, ...patch }
    this.emit('status', this.getStatus())
  }
}

export function resolveCoreCli(): string {
  const require = createRequire(import.meta.url)
  const packagePath = require.resolve('@waishnav/devspace/package.json')
  return join(dirname(packagePath), 'dist', 'cli.js')
}

function defaultSpawnCore(cliPath: string, _port: number, environment: NodeJS.ProcessEnv): ChildProcess {
  return spawn(process.execPath, [cliPath, 'serve'], {
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '1',
      ...environment
    },
    stdio: ['ignore', 'pipe', 'pipe']
  })
}

function probeLocalPort(port: number, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    const healthRequest = request({ host: '127.0.0.1', port, path: '/healthz', method: 'GET', headers: { 'User-Agent': 'DevSpace-Desktop-Health' } })
    let body = ''
    healthRequest.setTimeout(timeoutMs, () => healthRequest.destroy())
    healthRequest.on('response', (response) => {
      response.setEncoding('utf8')
      response.on('data', (chunk: string) => { body += chunk })
      response.on('end', () => {
        try {
          const value = JSON.parse(body) as Record<string, unknown>
          resolve(response.statusCode === 200 && value.ok === true && value.name === 'devspace')
        } catch {
          resolve(false)
        }
      })
    })
    healthRequest.on('error', () => resolve(false))
    healthRequest.end()
  })
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}
