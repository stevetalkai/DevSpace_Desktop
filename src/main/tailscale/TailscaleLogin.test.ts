import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import type { ChildProcess } from 'node:child_process'
import { describe, expect, it, vi } from 'vitest'
import { authenticationUrl, TailscaleLogin } from './TailscaleLogin'

function processStub() {
  return Object.assign(new EventEmitter(), { stdout: new PassThrough(), stderr: new PassThrough(), kill: vi.fn() })
}

describe('browser login', () => {
  it('only accepts complete official authentication URLs', () => {
    expect(authenticationUrl('https://login.tailscale.com/a/abc123')).toBeNull()
    expect(authenticationUrl('https://login.tailscale.com.evil/a/abc123\n')).toBeNull()
    expect(authenticationUrl('https://login.tailscale.com/a/abc123\n')).toBe('https://login.tailscale.com/a/abc123')
  })
  it('reads split stderr output, opens once and deduplicates login requests', async () => {
    const child = processStub()
    const open = vi.fn(async () => undefined)
    const start = vi.fn(() => child as unknown as ChildProcess)
    const login = new TailscaleLogin(open, start)
    const pending = login.login('/bin/tailscale')
    expect(login.login('/bin/tailscale')).toBe(pending)
    child.stderr.write('To authenticate: https://login.tailscale.com/a/abc')
    expect(open).not.toHaveBeenCalled()
    child.stderr.write('123\n')
    child.stdout.write('https://login.tailscale.com/a/abc123\n')
    expect(open).toHaveBeenCalledExactlyOnceWith('https://login.tailscale.com/a/abc123')
    child.emit('close', 0)
    await pending
    expect(start).toHaveBeenCalledExactlyOnceWith('/bin/tailscale', ['login', '--timeout=120s'])
  })
  it('reports browser failures and stops its login process', async () => {
    const child = processStub()
    const login = new TailscaleLogin(async () => { throw new Error('denied') }, () => child as unknown as ChildProcess)
    const pending = login.login('/bin/tailscale')
    child.stdout.write('https://login.tailscale.com/a/abc123\n')
    await expect(pending).rejects.toThrow('browser')
    expect(child.kill).toHaveBeenCalled()
  })
})
