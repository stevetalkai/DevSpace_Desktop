import type { TunnelStatus } from './TunnelProvider'

interface TailscaleNodeStatus {
  BackendState?: unknown
  CurrentTailnet?: unknown
  Self?: unknown
}

export interface ParsedTailscaleStatus {
  daemonAvailable: boolean
  loggedIn: boolean
  online: boolean
  dnsName: string | null
}

export function parseTailscaleStatus(source: string): ParsedTailscaleStatus {
  const value: unknown = JSON.parse(source)
  if (!isObject(value)) throw new Error('Tailscale status is not an object.')

  const status = value as TailscaleNodeStatus
  const backendState = typeof status.BackendState === 'string' ? status.BackendState : null
  const self = isObject(status.Self) ? status.Self : null
  if (!backendState) throw new Error('Tailscale status does not contain BackendState.')

  const loggedIn = backendState !== 'NeedsLogin' && backendState !== 'NoState' && (self !== null || isObject(status.CurrentTailnet))
  const online = backendState === 'Running' && self?.Online === true
  const rawDnsName = typeof self?.DNSName === 'string' ? self.DNSName.trim() : ''

  return {
    daemonAvailable: true,
    loggedIn,
    online,
    dnsName: rawDnsName ? rawDnsName.replace(/\.$/, '') : null
  }
}

export function parseFunnelJson(source: string): TunnelStatus {
  const value: unknown = JSON.parse(source)
  if (!isObject(value)) throw new Error('Funnel status is not an object.')
  if (Object.keys(value).length === 0) return stoppedStatus()

  const publicUrls = new Set<string>()
  const localPorts = new Set<number>()
  collectFunnelValues(value, publicUrls, localPorts)

  if (publicUrls.size === 0 && localPorts.size === 0) {
    if (['TCP', 'Web', 'AllowFunnel'].some((key) => key in value)) return stoppedStatus()
    throw new Error('Funnel status does not contain a known configuration.')
  }
  if (publicUrls.size !== 1 || localPorts.size !== 1) throw new Error('Funnel status is ambiguous.')

  return runningStatus([...localPorts][0]!, [...publicUrls][0]!)
}

export function parseFunnelText(source: string): TunnelStatus {
  const text = source.trim()
  if (!text || /no (serve|funnel) config|not (currently )?(serving|funneling)|funnel is off/i.test(text)) {
    return stoppedStatus()
  }

  const urlMatches = [...text.matchAll(/https:\/\/[^\s|)]+/gi)].map((match) => trimUrlPunctuation(match[0]))
  const portMatches = [...text.matchAll(/(?:https?:\/\/)?(?:127\.0\.0\.1|localhost|\[::1\])(?::|%3A)(\d{1,5})/gi)]
    .map((match) => Number(match[1]))
    .filter(isValidPort)
  const publicUrls = [...new Set(urlMatches)]
  const localPorts = [...new Set(portMatches)]

  if (publicUrls.length === 0 && localPorts.length === 0) throw new Error('Funnel text status is not recognized.')
  if (publicUrls.length !== 1 || localPorts.length !== 1) throw new Error('Funnel text status is ambiguous.')
  return runningStatus(localPorts[0]!, publicUrls[0]!)
}

export function normalizeMcpUrl(source: string): string {
  const url = new URL(source)
  if (url.protocol !== 'https:' || !url.hostname) throw new Error('Funnel URL must use HTTPS.')
  url.pathname = '/mcp'
  url.search = ''
  url.hash = ''
  return url.toString()
}

function collectFunnelValues(value: unknown, publicUrls: Set<string>, localPorts: Set<number>): void {
  if (typeof value === 'string') {
    if (/^https:\/\//i.test(value)) publicUrls.add(trimUrlPunctuation(value))
    const proxy = value.match(/^https?:\/\/(?:127\.0\.0\.1|localhost|\[::1\]):(\d{1,5})(?:\/|$)/i)
    if (proxy) {
      const port = Number(proxy[1])
      if (isValidPort(port)) localPorts.add(port)
    }
    return
  }

  if (Array.isArray(value)) {
    value.forEach((item) => collectFunnelValues(item, publicUrls, localPorts))
    return
  }
  if (!isObject(value)) return

  for (const [key, item] of Object.entries(value)) {
    if (/^[a-z0-9.-]+\.ts\.net(?::\d+)?$/i.test(key)) publicUrls.add(`https://${key}`)
    if (/^https:\/\//i.test(key)) publicUrls.add(trimUrlPunctuation(key))
    collectFunnelValues(item, publicUrls, localPorts)
  }
}

function runningStatus(localPort: number, publicUrl: string): TunnelStatus {
  return {
    state: 'running',
    localPort,
    publicUrl: normalizeMcpUrl(publicUrl),
    errorCode: null
  }
}

function stoppedStatus(): TunnelStatus {
  return { state: 'stopped', localPort: null, publicUrl: null, errorCode: null }
}

function trimUrlPunctuation(value: string): string {
  return value.replace(/[,.]+$/, '')
}

function isValidPort(value: number): boolean {
  return Number.isInteger(value) && value >= 1 && value <= 65_535
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
