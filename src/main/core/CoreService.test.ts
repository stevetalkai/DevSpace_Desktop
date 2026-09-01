import { EventEmitter } from 'node:events'
import { describe, expect, it, vi } from 'vitest'
import { CoreService } from './CoreService'

class FakeChild extends EventEmitter {
  killedWith: NodeJS.Signals[] = []

  kill(signal: NodeJS.Signals = 'SIGTERM'): boolean {
    this.killedWith.push(signal)
    queueMicrotask(() => this.emit('exit', 0, signal))
    return true
  }
}

describe('CoreService', () => {
  it('starts one process and reports running after the port responds', async () => {
    const child = new FakeChild()
    const spawnCore = vi.fn((cliPath: string, port: number, environment: NodeJS.ProcessEnv) => {
      expect(cliPath).toBe('/fake/cli.js')
      expect(port).toBe(7676)
      expect(environment.HOST).toBe('127.0.0.1')
      return child as never
    })
    const service = new CoreService({ spawnCore, probePort: async () => true, resolveCli: () => '/fake/cli.js' })

    const [first, second] = await Promise.all([service.start(), service.start()])

    expect(spawnCore).toHaveBeenCalledOnce()
    expect(first.phase).toBe('running')
    expect(second.phase).toBe('running')
    expect(spawnCore.mock.calls[0]?.[1]).toBe(7676)
    expect(spawnCore.mock.calls[0]?.[2]).toMatchObject({ HOST: '127.0.0.1', PORT: '7676' })
  })

  it('stops only the process it started', async () => {
    const child = new FakeChild()
    const service = new CoreService({ spawnCore: () => child as never, probePort: async () => true, resolveCli: () => '/fake/cli.js' })
    await service.start()

    const status = await service.stop()

    expect(status.phase).toBe('stopped')
    expect(child.killedWith).toEqual(['SIGTERM'])
  })

  it('reports a failed state when the process cannot launch', async () => {
    const service = new CoreService({
      spawnCore: () => {
        throw new Error('unavailable')
      },
      resolveCli: () => '/fake/cli.js'
    })

    await expect(service.start()).resolves.toMatchObject({
      phase: 'failed',
      errorCode: 'core_launch_failed'
    })
  })

  it('reports a crash when the child exits unexpectedly', async () => {
    const child = new FakeChild()
    const service = new CoreService({ spawnCore: () => child as never, probePort: async () => true, resolveCli: () => '/fake/cli.js' })
    await service.start()

    child.emit('exit', 1, null)

    expect(service.getStatus()).toMatchObject({ phase: 'failed', errorCode: 'core_crashed' })
  })
})
