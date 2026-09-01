import { EventEmitter } from 'node:events'
import { createConnection } from 'node:net'
import { randomBytes } from 'node:crypto'
import { dirname, join } from 'node:path'
import { createRequire } from 'node:module'
import { spawn, type ChildProcess } from 'node:child_process'
import type { CoreStatus } from '../../shared/contracts'

type SpawnCore = (cliPath: string, port: number, environment: NodeJS.ProcessEnv) => ChildProcess
type ProbePort = (port: number, timeoutMs: number) => Promise<boolean>

export interface CoreServiceOptions {
  port?: number
  startupTimeoutMs?: number
  spawnCore?: SpawnCore
  probePort?: ProbePort
  resolveCli?: () => string
  allowedRoots?: string[]
  ownerToken?: string
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
  private readonly probePort: ProbePort
  private readonly resolveCli: () => string
  private readonly environment: NodeJS.ProcessEnv
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
    this.environment = {
      HOST: '127.0.0.1',
      PORT: String(this.port),
      DEVSPACE_ALLOWED_ROOTS: (options.allowedRoots ?? [process.cwd()]).join(','),
      DEVSPACE_OAUTH_OWNER_TOKEN: options.ownerToken ?? randomBytes(32).toString('hex')
    }
    this.status = initialStatus(this.port)
  }

  getStatus(): CoreStatus {
    return { ...this.status }
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
      cliPath = this.resolveCli()
      this.process = this.spawnCore(cliPath, this.port, this.environment)
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
    const socket = createConnection({ host: '127.0.0.1', port })
    const finish = (result: boolean): void => {
      socket.destroy()
      resolve(result)
    }
    socket.setTimeout(timeoutMs)
    socket.once('connect', () => finish(true))
    socket.once('timeout', () => finish(false))
    socket.once('error', () => finish(false))
  })
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}
