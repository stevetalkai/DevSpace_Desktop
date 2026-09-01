import { mkdtemp, readFile, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { AppSettingsStore } from './AppSettingsStore'

const directories: string[] = []
afterEach(async () => Promise.all(directories.splice(0).map((path) => rm(path, { recursive: true, force: true }))))

describe('AppSettingsStore', () => {
  it('uses conservative defaults and persists supported values privately', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'devspace-settings-'))
    directories.push(directory)
    const file = join(directory, 'nested', 'settings.json')
    const store = new AppSettingsStore(file)
    expect(await store.load()).toEqual({ launchAtLogin: false, locale: null, resumeConnection: false })

    await store.update({ launchAtLogin: true, locale: 'zh-Hans', resumeConnection: true })
    const restored = new AppSettingsStore(file)
    expect(await restored.load()).toEqual({ launchAtLogin: true, locale: 'zh-Hans', resumeConnection: true })
    expect(JSON.parse(await readFile(file, 'utf8'))).toMatchObject({ version: 1 })
    expect((await stat(file)).mode & 0o777).toBe(0o600)
  })
})
