import { randomUUID } from 'node:crypto'
import { chmod, mkdir, open, readFile, rename, unlink } from 'node:fs/promises'
import { dirname } from 'node:path'

export interface AppSettings {
  launchAtLogin: boolean
  locale: 'zh-Hans' | 'en' | null
  resumeConnection: boolean
}

const defaults: AppSettings = { launchAtLogin: false, locale: null, resumeConnection: false }

export class AppSettingsStore {
  private settings: AppSettings = { ...defaults }

  constructor(private readonly filePath: string) {}

  async load(): Promise<AppSettings> {
    try {
      const value = JSON.parse(await readFile(this.filePath, 'utf8')) as Partial<AppSettings>
      this.settings = {
        launchAtLogin: value.launchAtLogin === true,
        locale: value.locale === 'zh-Hans' || value.locale === 'en' ? value.locale : null,
        resumeConnection: value.resumeConnection === true
      }
    } catch (error) {
      if (!isMissingFile(error)) this.settings = { ...defaults }
    }
    return this.getSnapshot()
  }

  getSnapshot(): AppSettings {
    return { ...this.settings }
  }

  async update(patch: Partial<AppSettings>): Promise<AppSettings> {
    this.settings = { ...this.settings, ...patch }
    await this.save()
    return this.getSnapshot()
  }

  private async save(): Promise<void> {
    const directory = dirname(this.filePath)
    await mkdir(directory, { recursive: true, mode: 0o700 })
    await chmod(directory, 0o700)
    const temporaryPath = `${this.filePath}.${process.pid}.${randomUUID()}.tmp`
    let temporaryFile
    try {
      temporaryFile = await open(temporaryPath, 'wx', 0o600)
      await temporaryFile.writeFile(`${JSON.stringify({ version: 1, ...this.settings }, null, 2)}\n`, 'utf8')
      await temporaryFile.sync()
      await temporaryFile.close()
      temporaryFile = undefined
      await rename(temporaryPath, this.filePath)
      await chmod(this.filePath, 0o600)
    } catch (error) {
      await temporaryFile?.close().catch(() => undefined)
      await unlink(temporaryPath).catch(() => undefined)
      throw error
    }
  }
}

function isMissingFile(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT'
}
