import { beforeEach, describe, expect, it, vi } from 'vitest'
import { accessSync, realpathSync } from 'node:fs'
import { findTailscaleExecutable } from './TailscaleExecutable'

vi.mock('node:fs', () => ({ accessSync: vi.fn(), realpathSync: vi.fn(), constants: { X_OK: 1 } }))

beforeEach(() => {
  vi.mocked(accessSync).mockReset()
  vi.mocked(realpathSync).mockReset().mockImplementation(() => { throw new Error('missing') })
})

describe('standalone Tailscale discovery', () => {
  it('detects the Windows app bundled CLI after installation without restarting', () => {
    expect(() => findTailscaleExecutable('win32', '')).toThrow()
    vi.mocked(realpathSync).mockImplementation((path) => {
      if (path === 'C:\\Program Files\\Tailscale\\tailscale.exe') return String(path)
      throw new Error('missing')
    })
    expect(findTailscaleExecutable('win32', '')).toBe('C:\\Program Files\\Tailscale\\tailscale.exe')
  })

  it('finds a CLI installed outside the standard directories', () => {
    vi.mocked(realpathSync).mockImplementation((path) => {
      if (path === '/custom/bin/tailscale') return String(path)
      throw new Error('missing')
    })
    expect(findTailscaleExecutable('darwin', '/custom/bin')).toBe('/custom/bin/tailscale')
  })

  it('rejects PATH aliases that point into a GUI app', () => {
    vi.mocked(realpathSync).mockReturnValue('/Applications/Tailscale.app/Contents/MacOS/Tailscale')
    expect(() => findTailscaleExecutable('darwin', '/custom/bin')).toThrow('not installed')
    expect(accessSync).not.toHaveBeenCalled()
  })

  it('rediscovers a CLI after the user installs it', () => {
    expect(() => findTailscaleExecutable('darwin', '')).toThrow('not installed')
    vi.mocked(realpathSync).mockImplementation((path) => {
      if (path === '/usr/local/bin/tailscale') return String(path)
      throw new Error('missing')
    })
    expect(findTailscaleExecutable('darwin', '')).toBe('/usr/local/bin/tailscale')
  })
})
