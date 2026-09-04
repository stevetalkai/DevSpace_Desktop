import { lookup } from 'node:dns/promises'
import { request } from 'node:https'

export type TailscaleConnectivityResult = 'reachable' | 'proxy_dns_conflict' | 'coordination_unavailable'

interface TailscaleConnectivityCheckOptions {
  resolveAddresses?: () => Promise<string[]>
  probe?: () => Promise<void>
}

const COORDINATION_HOST = 'controlplane.tailscale.com'

export async function checkTailscaleConnectivity(
  options: TailscaleConnectivityCheckOptions = {}
): Promise<TailscaleConnectivityResult> {
  let addresses: string[]
  try {
    addresses = await (options.resolveAddresses ?? resolveCoordinationAddresses)()
  } catch {
    return 'coordination_unavailable'
  }

  if (addresses.some(isProxyVirtualAddress)) return 'proxy_dns_conflict'

  try {
    await (options.probe ?? probeCoordinationServer)()
    return 'reachable'
  } catch {
    return 'coordination_unavailable'
  }
}

export function isProxyVirtualAddress(address: string): boolean {
  const normalized = address.toLowerCase().replace(/^::ffff:/, '')
  const parts = normalized.split('.').map(Number)
  return parts.length === 4 && parts.every((part) => Number.isInteger(part) && part >= 0 && part <= 255) &&
    parts[0] === 198 && (parts[1] === 18 || parts[1] === 19)
}

async function resolveCoordinationAddresses(): Promise<string[]> {
  return (await lookup(COORDINATION_HOST, { all: true })).map(({ address }) => address)
}

function probeCoordinationServer(): Promise<void> {
  return new Promise((resolve, reject) => {
    const probe = request({
      hostname: COORDINATION_HOST,
      method: 'HEAD',
      path: '/',
      port: 443,
      timeout: 5_000
    }, (response) => {
      response.resume()
      resolve()
    })
    probe.once('timeout', () => probe.destroy(new Error('Tailscale coordination check timed out')))
    probe.once('error', reject)
    probe.end()
  })
}
