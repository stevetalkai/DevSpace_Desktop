import { EventEmitter } from 'node:events'
import type { CoreStatus, TunnelPhase, TunnelStatus } from '../../shared/contracts'
import type { TunnelEnvironment, TunnelErrorCode, TunnelProvider, TunnelStatus as ProviderStatus } from './TunnelProvider'
import { TunnelProviderError } from './TunnelProvider'

export class TunnelController extends EventEmitter {
  private status: TunnelStatus = { phase: 'checking', publicUrl: null, mcpUrl: null, errorCode: null }

  constructor(
    private readonly provider: TunnelProvider,
    private readonly getCoreStatus: () => CoreStatus
  ) {
    super()
  }

  getStatus(): TunnelStatus {
    return { ...this.status }
  }

  async detect(): Promise<TunnelStatus> {
    this.update({ phase: 'checking', publicUrl: null, mcpUrl: null, errorCode: null })
    const environment = await this.provider.detect()
    if (environment.errorCode) return this.update(fromEnvironment(environment))
    return this.update(fromProviderStatus(await this.provider.status()))
  }

  async start(): Promise<TunnelStatus> {
    const core = this.getCoreStatus()
    if (core.phase !== 'running') {
      return this.update({ phase: 'failed', publicUrl: null, mcpUrl: null, errorCode: 'core_not_running' })
    }

    this.update({ phase: 'starting', publicUrl: null, mcpUrl: null, errorCode: null })
    try {
      const info = await this.provider.start(core.port)
      return this.update(connected(info.publicUrl))
    } catch (error) {
      return this.update(fromError(error instanceof TunnelProviderError ? error.code : 'funnel_failed'))
    }
  }

  async stop(): Promise<TunnelStatus> {
    this.update({ ...this.status, phase: 'stopping', errorCode: null })
    try {
      await this.provider.stop(this.getCoreStatus().port)
      return this.update({ phase: 'ready', publicUrl: null, mcpUrl: null, errorCode: null })
    } catch (error) {
      return this.update(fromError(error instanceof TunnelProviderError ? error.code : 'funnel_failed'))
    }
  }

  private update(status: TunnelStatus): TunnelStatus {
    this.status = status
    const snapshot = this.getStatus()
    this.emit('status', snapshot)
    return snapshot
  }
}

function fromEnvironment(environment: TunnelEnvironment): TunnelStatus {
  return fromError(environment.errorCode ?? 'invalid_output')
}

function fromProviderStatus(status: ProviderStatus): TunnelStatus {
  if (status.state === 'running' && status.publicUrl) return connected(status.publicUrl)
  if (status.state === 'stopped') return { phase: 'ready', publicUrl: null, mcpUrl: null, errorCode: null }
  return fromError(status.errorCode ?? 'invalid_output')
}

function connected(mcpUrl: string): TunnelStatus {
  const parsed = new URL(mcpUrl)
  return { phase: 'connected', publicUrl: parsed.origin, mcpUrl: parsed.toString(), errorCode: null }
}

function fromError(errorCode: TunnelErrorCode): TunnelStatus {
  let phase: TunnelPhase = 'failed'
  if (errorCode === 'cli_missing') phase = 'cli-missing'
  else if (errorCode === 'daemon_unavailable') phase = 'daemon-unavailable'
  else if (errorCode === 'not_logged_in') phase = 'not-logged-in'
  else if (errorCode === 'offline') phase = 'offline'
  return { phase, publicUrl: null, mcpUrl: null, errorCode }
}
