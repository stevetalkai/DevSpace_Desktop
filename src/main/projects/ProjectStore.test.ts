import { mkdir, mkdtemp, readFile, realpath, rm, stat, symlink, writeFile } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { isHighRiskProjectPath, PROJECT_STORE_VERSION, ProjectStore } from './ProjectStore'

const temporaryDirectories: string[] = []

async function makeTemporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'devspace-project-store-'))
  temporaryDirectories.push(directory)
  return directory
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

describe('ProjectStore', () => {
  it('starts empty and persists a project with private permissions', async () => {
    const root = await makeTemporaryDirectory()
    const projectPath = join(root, 'example-project')
    const configPath = join(root, 'settings', 'projects.json')
    await mkdir(projectPath)
    const store = new ProjectStore(configPath, {
      createId: () => 'project-1',
      now: () => new Date('2026-09-02T01:02:03.000Z')
    })

    expect(await store.load()).toEqual({ version: PROJECT_STORE_VERSION, projects: [], loadError: null })
    await store.add(projectPath, 'Example')

    const saved = JSON.parse(await readFile(configPath, 'utf8')) as Record<string, unknown>
    expect(saved).toEqual({
      version: PROJECT_STORE_VERSION,
      projects: [
        {
          id: 'project-1',
          name: 'Example',
          path: await realpath(projectPath),
          addedAt: '2026-09-02T01:02:03.000Z',
          highRisk: false
        }
      ]
    })
    if (process.platform !== 'win32') {
      expect((await stat(join(root, 'settings'))).mode & 0o777).toBe(0o700)
      expect((await stat(configPath)).mode & 0o777).toBe(0o600)
    }

    const reloaded = new ProjectStore(configPath)
    expect((await reloaded.load()).projects).toEqual(saved.projects)
  })

  it('uses real paths to deduplicate symbolic links', async () => {
    const root = await makeTemporaryDirectory()
    const projectPath = join(root, 'real-project')
    const aliasPath = join(root, 'project-alias')
    await mkdir(projectPath)
    await symlink(projectPath, aliasPath, process.platform === 'win32' ? 'junction' : 'dir')
    const store = new ProjectStore(join(root, 'settings', 'projects.json'), {
      createId: () => 'only-project'
    })
    await store.load()

    const original = await store.add(projectPath)
    const duplicate = await store.add(aliasPath, 'Ignored duplicate name')

    expect(duplicate).toEqual(original)
    expect(store.getSnapshot().projects).toHaveLength(1)
  })

  it('removes a project and persists the deletion', async () => {
    const root = await makeTemporaryDirectory()
    const projectPath = join(root, 'project')
    const configPath = join(root, 'settings', 'projects.json')
    await mkdir(projectPath)
    const store = new ProjectStore(configPath, { createId: () => 'project-to-remove' })
    await store.load()
    await store.add(projectPath)

    expect(await store.remove('missing-project')).toBe(false)
    expect(await store.remove('project-to-remove')).toBe(true)
    expect(store.getSnapshot().projects).toEqual([])

    const reloaded = new ProjectStore(configPath)
    expect((await reloaded.load()).projects).toEqual([])
  })

  it('recovers from a damaged configuration and keeps the load error', async () => {
    const root = await makeTemporaryDirectory()
    const configPath = join(root, 'settings', 'projects.json')
    await mkdir(join(root, 'settings'))
    await writeFile(configPath, '{not valid JSON', 'utf8')

    const store = new ProjectStore(configPath)
    const snapshot = await store.load()

    expect(snapshot.projects).toEqual([])
    expect(snapshot.loadError).toMatchObject({ code: 'invalid_config' })
    expect(store.getSnapshot().loadError).toEqual(snapshot.loadError)
  })

  it('marks the home directory, filesystem root, and volume roots as high risk', async () => {
    expect(isHighRiskProjectPath(homedir())).toBe(true)
    expect(isHighRiskProjectPath('/')).toBe(true)
    if (process.platform === 'darwin') {
      expect(isHighRiskProjectPath('/Volumes/ExternalDisk')).toBe(true)
      expect(isHighRiskProjectPath('/Volumes/ExternalDisk/work')).toBe(false)
    }

    const root = await makeTemporaryDirectory()
    const homeStore = new ProjectStore(join(root, 'settings', 'projects.json'), {
      homeDirectory: await realpath(root),
      createId: () => 'home-project'
    })
    await homeStore.load()
    const project = await homeStore.add(root)

    expect(project.highRisk).toBe(true)
  })
})
