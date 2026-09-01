import { describe, expect, it } from 'vitest'
import { normalizeMcpUrl, parseFunnelJson, parseFunnelText, parseTailscaleStatus } from './TailscaleStatusParser'

describe('parseTailscaleStatus', () => {
  it('reads an online, logged-in node and removes the DNS trailing dot', () => {
    expect(
      parseTailscaleStatus(
        JSON.stringify({
          BackendState: 'Running',
          CurrentTailnet: { Name: 'example' },
          Self: { Online: true, DNSName: 'desktop.tailnet.ts.net.' }
        })
      )
    ).toEqual({
      daemonAvailable: true,
      loggedIn: true,
      online: true,
      dnsName: 'desktop.tailnet.ts.net'
    })
  })

  it('distinguishes a logged-out daemon from an offline node', () => {
    expect(parseTailscaleStatus(JSON.stringify({ BackendState: 'NeedsLogin' }))).toMatchObject({
      loggedIn: false,
      online: false
    })
    expect(
      parseTailscaleStatus(
        JSON.stringify({ BackendState: 'Stopped', CurrentTailnet: { Name: 'example' }, Self: { Online: false } })
      )
    ).toMatchObject({ loggedIn: true, online: false })
  })
})

describe('parseFunnelJson', () => {
  it('reads the current port and public host from serve-config JSON', () => {
    const status = parseFunnelJson(
      JSON.stringify({
        Web: {
          'desktop.tailnet.ts.net:443': {
            Handlers: { '/': { Proxy: 'http://127.0.0.1:7676' } }
          }
        },
        AllowFunnel: { 'desktop.tailnet.ts.net:443': true }
      })
    )

    expect(status).toEqual({
      state: 'running',
      localPort: 7676,
      publicUrl: 'https://desktop.tailnet.ts.net/mcp',
      errorCode: null
    })
  })

  it('recognizes an empty current-format configuration as stopped', () => {
    expect(parseFunnelJson('{"TCP":{},"Web":{},"AllowFunnel":{}}')).toMatchObject({ state: 'stopped' })
  })

  it('rejects unknown and ambiguous JSON instead of guessing', () => {
    expect(() => parseFunnelJson('{"unexpected":true}')).toThrow()
    expect(() =>
      parseFunnelJson(
        JSON.stringify({
          urls: ['https://one.ts.net', 'https://two.ts.net'],
          proxies: ['http://127.0.0.1:7001', 'http://127.0.0.1:7002']
        })
      )
    ).toThrow()
  })
})

describe('parseFunnelText', () => {
  it('conservatively parses the legacy status format', () => {
    expect(
      parseFunnelText(`Available on the internet:\n\nhttps://desktop.tailnet.ts.net/\n|-- proxy http://127.0.0.1:7676`)
    ).toEqual({
      state: 'running',
      localPort: 7676,
      publicUrl: 'https://desktop.tailnet.ts.net/mcp',
      errorCode: null
    })
  })

  it('recognizes explicit stopped output but rejects unrelated text', () => {
    expect(parseFunnelText('No Funnel config')).toMatchObject({ state: 'stopped' })
    expect(() => parseFunnelText('Tailscale is ready.')).toThrow()
  })
})

describe('normalizeMcpUrl', () => {
  it('replaces path, query, and fragment with the MCP endpoint', () => {
    expect(normalizeMcpUrl('https://desktop.tailnet.ts.net:8443/old?q=1#part')).toBe(
      'https://desktop.tailnet.ts.net:8443/mcp'
    )
  })

  it('rejects non-HTTPS URLs', () => {
    expect(() => normalizeMcpUrl('http://desktop.tailnet.ts.net')).toThrow()
  })
})
