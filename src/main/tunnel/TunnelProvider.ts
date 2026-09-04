export type TunnelErrorCode =
  | 'cli_missing'
  | 'daemon_unavailable'
  | 'not_logged_in'
  | 'offline'
  | 'proxy_dns_conflict'
  | 'coordination_unavailable'
  | 'unsupported'
  | 'funnel_failed'
  | 'invalid_output'
  | 'timeout'

export interface TunnelEnvironment {
  cliInstalled: boolean
  daemonAvailable: boolean
  loggedIn: boolean
  online: boolean
  dnsName: string | null
  errorCode: TunnelErrorCode | null
}

export interface TunnelInfo {
  providerId: string
  localPort: number
  publicUrl: string
}

export interface TunnelStatus {
  state: 'stopped' | 'running' | 'error'
  localPort: number | null
  publicUrl: string | null
  errorCode: TunnelErrorCode | null
}

export interface TunnelProvider {
  readonly id: string
  readonly name: string

  detect(): Promise<TunnelEnvironment>
  start(localPort: number): Promise<TunnelInfo>
  stop(localPort: number): Promise<void>
  status(): Promise<TunnelStatus>
}

export class TunnelProviderError extends Error {
  readonly code: TunnelErrorCode

  constructor(code: TunnelErrorCode, message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'TunnelProviderError'
    this.code = code
  }
}
