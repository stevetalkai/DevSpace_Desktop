import { EventEmitter } from 'node:events'
import { describe, expect, it, vi } from 'vitest'
import { CoreService } from './CoreService'

class FakeChild extends EventEmitter {
  killedWith: NodeJS.Signals[] = []
  stdout = new EventEmitter()
  stderr = new EventEmitter()

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
      expect(environment.HOST).toBeUndefined()
      expect(environment.PORT).toBeUndefined()
      return child as never
    })
    const service = new CoreService({ spawnCore, probePort: async () => true, resolveCli: () => '/fake/cli.js' })

    const [first, second] = await Promise.all([service.start(), service.start()])

    expect(spawnCore).toHaveBeenCalledOnce()
    expect(first.phase).toBe('running')
    expect(second.phase).toBe('running')
    expect(spawnCore.mock.calls[0]?.[1]).toBe(7676)
    expect(spawnCore.mock.calls[0]?.[2]).not.toHaveProperty('HOST')
    expect(spawnCore.mock.calls[0]?.[2]).not.toHaveProperty('PORT')
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

  it('preserves raw stderr and process exit details for crash diagnostics', async () => {
    const child = new FakeChild()
    const service = new CoreService({ spawnCore: () => child as never, probePort: async () => true, resolveCli: () => '/fake/cli.js' })
    const outputListener = vi.fn()
    const exitListener = vi.fn()
    service.on('core-output', outputListener)
    service.on('core-exit', exitListener)
    await service.start()

    child.stderr.emit('data', 'Error: transport failed\n    at server.js:1:1\n')
    child.emit('exit', 1, null)

    expect(outputListener).toHaveBeenNthCalledWith(1, { stream: 'stderr', line: 'Error: transport failed' })
    expect(outputListener).toHaveBeenNthCalledWith(2, { stream: 'stderr', line: 'at server.js:1:1' })
    expect(exitListener).toHaveBeenCalledWith({ code: 1, signal: null })
  })

  it('restarts a running process with updated allowed roots', async () => {
    const children = [new FakeChild(), new FakeChild()]
    const environments: NodeJS.ProcessEnv[] = []
    const service = new CoreService({
      allowedRoots: ['/private/empty'],
      fallbackRoot: '/private/empty',
      resolveCli: () => '/fake/cli.js',
      probePort: async () => true,
      spawnCore: (_cliPath, _port, environment) => {
        environments.push({ ...environment })
        return children.shift() as never
      }
    })
    await service.start()

    const status = await service.replaceAllowedRoots(['/projects/one', '/projects/two'])

    expect(status.phase).toBe('running')
    expect(environments).toHaveLength(2)
    expect(environments[1]?.DEVSPACE_ALLOWED_ROOTS).toBe('/projects/one,/projects/two')
  })

  it('returns to the private fallback root after the last project is removed', async () => {
    const environments: NodeJS.ProcessEnv[] = []
    const service = new CoreService({
      allowedRoots: ['/projects/one'],
      fallbackRoot: '/private/empty',
      resolveCli: () => '/fake/cli.js',
      probePort: async () => true,
      spawnCore: (_cliPath, _port, environment) => {
        environments.push({ ...environment })
        return new FakeChild() as never
      }
    })
    await service.start()

    await service.replaceAllowedRoots([])

    expect(environments[1]?.DEVSPACE_ALLOWED_ROOTS).toBe('/private/empty')
  })

  it('restarts automatically after an unexpected crash', async () => {
    vi.useFakeTimers()
    const first = new FakeChild()
    const second = new FakeChild()
    const spawnCore = vi.fn()
      .mockReturnValueOnce(first as never)
      .mockReturnValueOnce(second as never)
    const service = new CoreService({
      resolveCli: () => '/fake/cli.js',
      probePort: async () => true,
      spawnCore
    })
    await service.start()

    first.emit('exit', 1, null)
    expect(service.getStatus()).toMatchObject({ phase: 'failed', errorCode: 'core_crashed' })
    await vi.advanceTimersByTimeAsync(1_000)

    expect(spawnCore).toHaveBeenCalledTimes(2)
    expect(service.getStatus().phase).toBe('running')
    vi.useRealTimers()
  })
})
