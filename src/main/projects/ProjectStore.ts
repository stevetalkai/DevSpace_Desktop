import { randomUUID } from 'node:crypto'
import { constants } from 'node:fs'
import { chmod, mkdir, open, readFile, realpath, rename, stat, unlink } from 'node:fs/promises'
import { homedir } from 'node:os'
import { basename, dirname, parse, resolve } from 'node:path'

export const PROJECT_STORE_VERSION = 1 as const

export interface ProjectRecord {
  id: string
  name: string
  path: string
  addedAt: string
  highRisk: boolean
}

export interface ProjectStoreLoadError {
  code: 'invalid_config' | 'read_failed'
  message: string
}

export interface ProjectStoreSnapshot {
  version: typeof PROJECT_STORE_VERSION
  projects: ProjectRecord[]
  loadError: ProjectStoreLoadError | null
}

export interface ProjectStoreOptions {
  homeDirectory?: string
  createId?: () => string
  now?: () => Date
}

interface ProjectStoreFile {
  version: typeof PROJECT_STORE_VERSION
  projects: ProjectRecord[]
}

export class ProjectStore {
  private readonly configFilePath: string
  private readonly homeDirectory: string
  private readonly createId: () => string
  private readonly now: () => Date
  private projects: ProjectRecord[] = []
  private loadError: ProjectStoreLoadError | null = null

  constructor(configFilePath: string, options: ProjectStoreOptions = {}) {
    this.configFilePath = resolve(configFilePath)
    this.homeDirectory = resolve(options.homeDirectory ?? homedir())
    this.createId = options.createId ?? randomUUID
    this.now = options.now ?? (() => new Date())
  }

  async load(): Promise<ProjectStoreSnapshot> {
    try {
      const source = await readFile(this.configFilePath, 'utf8')
      const parsed: unknown = JSON.parse(source)
      const canonicalHome = await realpath(this.homeDirectory).catch(() => this.homeDirectory)
      this.projects = parseProjectStoreFile(parsed).projects.map((project) => ({
        ...project,
        highRisk: isHighRiskProjectPath(project.path, canonicalHome)
      }))
      this.loadError = null
    } catch (error) {
      this.projects = []
      if (isNodeError(error) && error.code === 'ENOENT') {
        this.loadError = null
      } else {
        this.loadError = {
          code: error instanceof SyntaxError || error instanceof InvalidProjectStoreError ? 'invalid_config' : 'read_failed',
          message: error instanceof Error ? error.message : 'Unable to load the project configuration.'
        }
      }
    }

    return this.getSnapshot()
  }

  getSnapshot(): ProjectStoreSnapshot {
    return {
      version: PROJECT_STORE_VERSION,
      projects: this.projects.map((project) => ({ ...project })),
      loadError: this.loadError ? { ...this.loadError } : null
    }
  }

  async add(projectPath: string, name?: string): Promise<ProjectRecord> {
    const canonicalPath = await realpath(projectPath)
    const canonicalHome = await realpath(this.homeDirectory).catch(() => this.homeDirectory)
    const projectStat = await stat(canonicalPath)
    if (!projectStat.isDirectory()) {
      throw new Error(`Project path is not a directory: ${canonicalPath}`)
    }

    const existing = this.projects.find((project) => project.path === canonicalPath)
    if (existing) return { ...existing }

    const trimmedName = name?.trim()
    const project: ProjectRecord = {
      id: this.createId(),
      name: trimmedName || basename(canonicalPath) || canonicalPath,
      path: canonicalPath,
      addedAt: this.now().toISOString(),
      highRisk: isHighRiskProjectPath(canonicalPath, canonicalHome)
    }

    this.projects.push(project)
    try {
      await this.save()
    } catch (error) {
      this.projects.pop()
      throw error
    }
    return { ...project }
  }

  async remove(projectId: string): Promise<boolean> {
    const index = this.projects.findIndex((project) => project.id === projectId)
    if (index === -1) return false

    const [removed] = this.projects.splice(index, 1)
    try {
      await this.save()
    } catch (error) {
      if (removed) this.projects.splice(index, 0, removed)
      throw error
    }
    return true
  }

  async save(): Promise<void> {
    const configDirectory = dirname(this.configFilePath)
    await mkdir(configDirectory, { recursive: true, mode: 0o700 })
    await chmod(configDirectory, 0o700)

    const temporaryPath = `${this.configFilePath}.${process.pid}.${randomUUID()}.tmp`
    const contents = `${JSON.stringify(
      { version: PROJECT_STORE_VERSION, projects: this.projects } satisfies ProjectStoreFile,
      null,
      2
    )}\n`

    let temporaryFile
    try {
      temporaryFile = await open(temporaryPath, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY, 0o600)
      await temporaryFile.writeFile(contents, 'utf8')
      await temporaryFile.sync()
      await temporaryFile.close()
      temporaryFile = undefined
      await rename(temporaryPath, this.configFilePath)
      await chmod(this.configFilePath, 0o600)
    } catch (error) {
      await temporaryFile?.close().catch(() => undefined)
      await unlink(temporaryPath).catch(() => undefined)
      throw error
    }
  }
}

export function isHighRiskProjectPath(projectPath: string, homeDirectory = homedir()): boolean {
  const normalizedPath = resolve(projectPath)
  const normalizedHome = resolve(homeDirectory)

  if (normalizedPath === normalizedHome || normalizedPath === parse(normalizedPath).root) return true

  const parent = dirname(normalizedPath)
  return parent === '/Volumes'
}

function parseProjectStoreFile(value: unknown): ProjectStoreFile {
  if (!isObject(value) || value.version !== PROJECT_STORE_VERSION || !Array.isArray(value.projects)) {
    throw new InvalidProjectStoreError('The project configuration has an unsupported or invalid format.')
  }

  const projects = value.projects.map((project) => {
    if (
      !isObject(project) ||
      typeof project.id !== 'string' ||
      typeof project.name !== 'string' ||
      typeof project.path !== 'string' ||
      typeof project.addedAt !== 'string' ||
      typeof project.highRisk !== 'boolean'
    ) {
      throw new InvalidProjectStoreError('The project configuration contains an invalid project record.')
    }
    return { ...project } as unknown as ProjectRecord
  })

  return { version: PROJECT_STORE_VERSION, projects }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isNodeError(value: unknown): value is NodeJS.ErrnoException {
  return value instanceof Error
}

class InvalidProjectStoreError extends Error {}
