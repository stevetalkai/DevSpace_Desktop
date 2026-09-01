import { mkdtemp, readFile, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { writeCoreConfiguration } from './CoreConfiguration'

const directories: string[] = []

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})
describe('writeCoreConfiguration', () => {
  it('writes private configuration with roots stored as an array', async () => {
    const parent = await mkdtemp(join(tmpdir(), 'devspace-core-config-'))
    directories.push(parent)
    const directory = join(parent, 'core')

    await writeCoreConfiguration(directory, 7676, ['/projects/one,with-comma', '/projects/two'])

    const contents = JSON.parse(await readFile(join(directory, 'config.json'), 'utf8')) as Record<string, unknown>
    expect(contents).toEqual({
      host: '127.0.0.1',
      port: 7676,
      allowedRoots: ['/projects/one,with-comma', '/projects/two']
    })
    expect((await stat(directory)).mode & 0o777).toBe(0o700)
    expect((await stat(join(directory, 'config.json'))).mode & 0o777).toBe(0o600)
  })

  it('writes the Funnel address as the OAuth public base URL', async () => {
    const parent = await mkdtemp(join(tmpdir(), 'devspace-core-config-'))
    directories.push(parent)
    const directory = join(parent, 'core')

    await writeCoreConfiguration(directory, 7676, ['/projects/one'], 'https://device.tailnet.ts.net')

    const contents = JSON.parse(await readFile(join(directory, 'config.json'), 'utf8')) as Record<string, unknown>
    expect(contents.publicBaseUrl).toBe('https://device.tailnet.ts.net')
  })
})
