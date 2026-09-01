import { constants } from 'node:fs'
import { chmod, mkdir, open, rename, stat, unlink } from 'node:fs/promises'
import { join, resolve } from 'node:path'

const MEMORY_EVENT_LIMIT = 500
const DEFAULT_MAX_FILE_BYTES = 1024 * 1024
const LOG_FILE_NAME = 'diagnostic.log'
const REDACTED_VALUE = '[REDACTED]'
const SENSITIVE_KEY_PATTERN = /token|password|authorization|secret|cookie/iu

export type DiagnosticLevel = 'debug' | 'info' | 'warn' | 'error'

export interface DiagnosticEvent {
  timestamp: string
  level: DiagnosticLevel
  source: string
  message: string
  details?: unknown
}

export interface DiagnosticLogStoreOptions {
  logsDirectory?: string
  maxFileBytes?: number
  now?: () => Date
}

export class DiagnosticLogStore {
  private readonly logsDirectory?: string
  private readonly maxFileBytes: number
  private readonly now: () => Date
  private readonly events: DiagnosticEvent[] = []
  private writeQueue = Promise.resolve()

  constructor(options: DiagnosticLogStoreOptions = {}) {
    this.logsDirectory = options.logsDirectory ? resolve(options.logsDirectory) : undefined
    this.maxFileBytes = Math.min(options.maxFileBytes ?? DEFAULT_MAX_FILE_BYTES, DEFAULT_MAX_FILE_BYTES)
    this.now = options.now ?? (() => new Date())

    if (!Number.isSafeInteger(this.maxFileBytes) || this.maxFileBytes <= 0) {
      throw new Error('Diagnostic log file size must be a positive integer.')
    }
  }

  append(level: DiagnosticLevel, source: string, message: string, details?: unknown): Promise<void> {
    const event: DiagnosticEvent = {
      timestamp: this.now().toISOString(),
      level,
      source,
      message,
      ...(details === undefined ? {} : { details: redactSensitiveValues(details) })
    }
    const encodedEvent = `${JSON.stringify(event)}\n`
    if (Buffer.byteLength(encodedEvent) > this.maxFileBytes) {
      return Promise.reject(new Error('Diagnostic event exceeds the maximum log file size.'))
    }

    const operation = this.writeQueue.then(async () => {
      if (this.logsDirectory) await this.persist(encodedEvent)
      this.events.push(event)
      if (this.events.length > MEMORY_EVENT_LIMIT) this.events.splice(0, this.events.length - MEMORY_EVENT_LIMIT)
    })
    this.writeQueue = operation.catch(() => undefined)
    return operation
  }

  getRecent(): DiagnosticEvent[] {
    return this.events.map((event) => ({
      ...event,
      ...(event.details === undefined ? {} : { details: redactSensitiveValues(event.details) })
    }))
  }

  private async persist(encodedEvent: string): Promise<void> {
    if (!this.logsDirectory) return

    await mkdir(this.logsDirectory, { recursive: true, mode: 0o700 })
    await chmod(this.logsDirectory, 0o700)

    const currentLogPath = join(this.logsDirectory, LOG_FILE_NAME)
    const currentSize = await stat(currentLogPath).then((value) => value.size).catch((error: unknown) => {
      if (isMissingFileError(error)) return 0
      throw error
    })
    if (currentSize > 0 && currentSize + Buffer.byteLength(encodedEvent) > this.maxFileBytes) {
      await this.rotateFiles(currentLogPath)
    }

    const file = await open(
      currentLogPath,
      constants.O_CREAT | constants.O_APPEND | constants.O_WRONLY,
      0o600
    )
    try {
      await file.writeFile(encodedEvent, 'utf8')
      await file.sync()
    } finally {
      await file.close()
    }
    await chmod(currentLogPath, 0o600)
  }

  private async rotateFiles(currentLogPath: string): Promise<void> {
    if (!this.logsDirectory) return

    const firstArchive = join(this.logsDirectory, `${LOG_FILE_NAME}.1`)
    const secondArchive = join(this.logsDirectory, `${LOG_FILE_NAME}.2`)
    await ignoreMissing(() => unlink(secondArchive))
    await ignoreMissing(() => rename(firstArchive, secondArchive))
    await rename(currentLogPath, firstArchive)
    await chmod(firstArchive, 0o600)
    await chmod(secondArchive, 0o600).catch((error: unknown) => {
      if (!isMissingFileError(error)) throw error
    })
  }
}

export function formatDiagnosticReport(snapshot: unknown, appVersion: string): string {
  return `${JSON.stringify({ appVersion, snapshot: redactSensitiveValues(snapshot) }, null, 2)}\n`
}

export function redactSensitiveValues(value: unknown): unknown {
  return redactValue(value, new WeakSet<object>())
}

function redactValue(value: unknown, visited: WeakSet<object>): unknown {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value
  if (typeof value === 'number') return Number.isFinite(value) ? value : String(value)
  if (typeof value === 'bigint') return value.toString()
  if (typeof value === 'undefined') return null
  if (typeof value !== 'object') return String(value)
  if (value instanceof Date) return value.toISOString()
  if (visited.has(value)) return '[Circular]'

  visited.add(value)
  if (Array.isArray(value)) {
    const redacted = value.map((item) => redactValue(item, visited))
    visited.delete(value)
    return redacted
  }

  const redacted = Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      SENSITIVE_KEY_PATTERN.test(key) ? REDACTED_VALUE : redactValue(item, visited)
    ])
  )
  visited.delete(value)
  return redacted
}

async function ignoreMissing(operation: () => Promise<unknown>): Promise<void> {
  try {
    await operation()
  } catch (error) {
    if (!isMissingFileError(error)) throw error
  }
}

function isMissingFileError(value: unknown): value is NodeJS.ErrnoException {
  return value instanceof Error && (value as NodeJS.ErrnoException).code === 'ENOENT'
}
