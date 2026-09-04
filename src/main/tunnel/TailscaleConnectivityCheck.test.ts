import { describe, expect, it, vi } from 'vitest'
import { checkTailscaleConnectivity, isProxyVirtualAddress } from './TailscaleConnectivityCheck'

describe('checkTailscaleConnectivity', () => {
  it('detects proxy virtual addresses without attempting a connection', async () => {
    const probe = vi.fn(async () => undefined)
    await expect(checkTailscaleConnectivity({
      resolveAddresses: async () => ['198.18.0.73'],
      probe
    })).resolves.toBe('proxy_dns_conflict')
    expect(probe).not.toHaveBeenCalled()
  })

  it('reports a reachable coordination server', async () => {
    await expect(checkTailscaleConnectivity({
      resolveAddresses: async () => ['192.200.0.112'],
      probe: async () => undefined
    })).resolves.toBe('reachable')
  })

  it('reports a network failure after real DNS resolution', async () => {
    await expect(checkTailscaleConnectivity({
      resolveAddresses: async () => ['192.200.0.112'],
      probe: async () => { throw new Error('blocked') }
    })).resolves.toBe('coordination_unavailable')
  })
})

describe('isProxyVirtualAddress', () => {
  it('matches the full 198.18.0.0/15 range and IPv4-mapped addresses', () => {
    expect(isProxyVirtualAddress('198.18.0.1')).toBe(true)
    expect(isProxyVirtualAddress('198.19.255.254')).toBe(true)
    expect(isProxyVirtualAddress('::ffff:198.18.0.73')).toBe(true)
    expect(isProxyVirtualAddress('192.200.0.112')).toBe(false)
  })
})
