import { describe, expect, it, vi } from 'vitest'
import {
  CORE_PORT_UNAVAILABLE_ERROR,
  CorePortResolutionError,
  resolveCorePort
} from './CorePortResolver'

describe('resolveCorePort', () => {
  it('returns the default port when it can bind on IPv4 loopback', async () => {
    const isAvailable = vi.fn(async () => true)

    await expect(resolveCorePort(isAvailable)).resolves.toBe(7676)
    expect(isAvailable).toHaveBeenCalledTimes(1)
    expect(isAvailable).toHaveBeenCalledWith('127.0.0.1', 7676)
  })

  it('tries occupied ports in order and returns the first available fallback', async () => {
    const isAvailable = vi.fn(async (_host: string, port: number) => port === 7679)

    await expect(resolveCorePort(isAvailable)).resolves.toBe(7679)
    expect(isAvailable.mock.calls).toEqual([
      ['127.0.0.1', 7676],
      ['127.0.0.1', 7677],
      ['127.0.0.1', 7678],
      ['127.0.0.1', 7679]
    ])
  })

  it('throws a stable error after every candidate port is unavailable', async () => {
    const isAvailable = vi.fn(async () => false)

    const error = await resolveCorePort(isAvailable).catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(CorePortResolutionError)
    expect(error).toMatchObject({ code: CORE_PORT_UNAVAILABLE_ERROR })
    expect(isAvailable.mock.calls).toEqual(
      Array.from({ length: 11 }, (_, index) => ['127.0.0.1', 7676 + index])
    )
  })
})
