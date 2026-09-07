import { constants } from 'node:fs'
import { chmod, mkdir, open, readFile, rename, stat, unlink } from 'node:fs/promises'
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

  clearToolHistory(): Promise<void> {
    const operation = this.writeQueue.then(async () => {
      if (this.logsDirectory) {
        for (const name of [`${LOG_FILE_NAME}.2`, `${LOG_FILE_NAME}.1`, LOG_FILE_NAME]) {
          const path = join(this.logsDirectory, name)
          const contents = await readFile(path, 'utf8').catch((error: unknown) => {
            if (isMissingFileError(error)) return null
            throw error
          })
          if (contents === null) continue
          const retained = contents.split(/\r?\n/).filter((line) => {
            try { return JSON.parse(line).message !== 'tool_call' } catch { return true }
          }).join('\n')
          const temporary = `${path}.clearing`
          const file = await open(temporary, 'w', 0o600)
          try { await file.writeFile(retained, 'utf8'); await file.sync() } finally { await file.close() }
          await rename(temporary, path)
        }
      }
      for (let i = this.events.length - 1; i >= 0; i--) {
        if (this.events[i]?.message === 'tool_call') this.events.splice(i, 1)
      }
    })
    this.writeQueue = operation.catch(() => undefined)
    return operation
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

  async getReportEvents(limit = 2_000): Promise<DiagnosticEvent[]> {
    await this.writeQueue
    if (!this.logsDirectory) return this.getRecent().slice(-limit)

    const events: DiagnosticEvent[] = []
    for (const fileName of [`${LOG_FILE_NAME}.2`, `${LOG_FILE_NAME}.1`, LOG_FILE_NAME]) {
      const contents = await readFile(join(this.logsDirectory, fileName), 'utf8').catch((error: unknown) => {
        if (isMissingFileError(error)) return ''
        throw error
      })
      for (const line of contents.split(/\r?\n/)) {
        if (!line.trim()) continue
        try {
          const event = JSON.parse(line) as DiagnosticEvent
          if (isDiagnosticEvent(event)) events.push(event)
        } catch {
          // A partially written final line should not prevent report export.
        }
      }
    }
    return (redactSensitiveValues(events.slice(-limit)) as DiagnosticEvent[])
  }
}

export function formatDiagnosticReport(snapshot: unknown, appVersion: string): string {
  return `${JSON.stringify({ appVersion, snapshot: redactSensitiveValues(snapshot) }, null, 2)}\n`
}

export function formatActivityReport(
  snapshot: unknown,
  events: DiagnosticEvent[],
  appVersion: string,
  locale: 'zh-Hans' | 'en' = 'zh-Hans',
  generatedAt = new Date()
): string {
  const safeSnapshot = redactSensitiveValues(snapshot) as Record<string, unknown>
  const safeEvents = redactSensitiveValues(events) as DiagnosticEvent[]
  const toolEvents = safeEvents.filter((event) => event.message === 'tool_call')
  const successfulTools = toolEvents.filter((event) => detailRecord(event).success !== false).length
  const failedTools = toolEvents.length - successfulTools
  const chinese = locale === 'zh-Hans'
  const lines = [
    `# ${chinese ? 'DevSpace 活动报告' : 'DevSpace Activity Report'}`,
    '',
    `- ${chinese ? '生成时间' : 'Generated'}：${generatedAt.toISOString()}`,
    `- ${chinese ? '应用版本' : 'App version'}：${appVersion}`,
    `- ${chinese ? '工具调用' : 'Tool calls'}：${toolEvents.length}`,
    `- ${chinese ? '成功/失败' : 'Succeeded/failed'}：${successfulTools}/${failedTools}`,
    '',
    `## ${chinese ? '运行概览' : 'Runtime overview'}`,
    '',
    ...snapshotSummary(safeSnapshot, chinese),
    '',
    `## ${chinese ? '工具调用时间线' : 'Tool call timeline'}`,
    ''
  ]

  if (toolEvents.length === 0) {
    lines.push(chinese ? '本次运行暂未记录工具调用。' : 'No tool calls were recorded in this run.', '')
  } else {
    lines.push(
      `| ${chinese ? '时间' : 'Time'} | ${chinese ? '工具' : 'Tool'} | ${chinese ? '操作详情' : 'Details'} | ${chinese ? '结果' : 'Result'} | ${chinese ? '耗时' : 'Duration'} |`,
      '| --- | --- | --- | --- | --- |'
    )
    for (const event of toolEvents) {
      const details = detailRecord(event)
      const succeeded = details.success !== false
      lines.push(`| ${markdownCell(event.timestamp)} | ${markdownCell(String(details.tool ?? 'unknown'))} | ${markdownCell(toolDescription(details, chinese))} | ${succeeded ? (chinese ? '成功' : 'Succeeded') : (chinese ? '失败' : 'Failed')} | ${typeof details.durationMs === 'number' ? `${details.durationMs} ms` : '—'} |`)
    }
    lines.push('')
  }

  lines.push(
    `## ${chinese ? '连接与服务事件' : 'Connection and service events'}`,
    ''
  )
  const lifecycleEvents = safeEvents.filter((event) =>
    event.message !== 'tool_call'
    && event.message !== 'http_request'
    && event.message !== 'mcp_request'
    && event.message !== 'stdout'
    && event.message !== 'stderr'
  )
  if (lifecycleEvents.length === 0) lines.push(chinese ? '无。' : 'None.')
  else for (const event of lifecycleEvents) lines.push(`- ${event.timestamp} · ${event.source} · ${event.message}`)

  lines.push(
    '',
    `## ${chinese ? '隐私说明' : 'Privacy note'}`,
    '',
    chinese
      ? '报告包含脱敏后的命令预览、工具名称、工作区和执行结果；密码、令牌、授权信息、文件正文及完整终端输出不会写入报告。'
      : 'The report includes redacted command previews, tool names, workspaces, and results. Passwords, tokens, authorization data, file contents, and full terminal output are excluded.',
    ''
  )
  return lines.join('\n')
}

function isDiagnosticEvent(value: unknown): value is DiagnosticEvent {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const event = value as Partial<DiagnosticEvent>
  return typeof event.timestamp === 'string'
    && typeof event.level === 'string'
    && typeof event.source === 'string'
    && typeof event.message === 'string'
}

function detailRecord(event: DiagnosticEvent): Record<string, unknown> {
  return event.details && typeof event.details === 'object' && !Array.isArray(event.details)
    ? event.details as Record<string, unknown>
    : {}
}

function snapshotSummary(snapshot: Record<string, unknown>, chinese: boolean): string[] {
  const core = objectRecord(snapshot.core)
  const tunnel = objectRecord(snapshot.tunnel)
  const chatgpt = objectRecord(snapshot.chatgpt)
  const projects = Array.isArray(snapshot.projects) ? snapshot.projects : []
  const activities = Array.isArray(snapshot.activities) ? snapshot.activities : []
  const toolCalls = Array.isArray(snapshot.toolCalls) ? snapshot.toolCalls : []
  const value = (record: Record<string, unknown>, key: string): string => {
    const item = record[key]
    return typeof item === 'string' || typeof item === 'number' ? String(item) : '—'
  }
  return [
    `| ${chinese ? '项目' : 'Item'} | ${chinese ? '状态/数量' : 'Status/count'} |`,
    '| --- | --- |',
    `| ${chinese ? '本地服务' : 'Local service'} | ${markdownCell(value(core, 'phase'))} |`,
    `| ${chinese ? '安全连接' : 'Secure connection'} | ${markdownCell(value(tunnel, 'phase'))} |`,
    `| ChatGPT | ${markdownCell(value(chatgpt, 'phase'))} |`,
    `| ${chinese ? '已授权项目' : 'Authorized projects'} | ${projects.length} |`,
    `| ${chinese ? '当前工具调用记录' : 'Current tool call records'} | ${toolCalls.length} |`,
    `| ${chinese ? '当前活动记录' : 'Current activity records'} | ${activities.length} |`
  ]
}

function objectRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function toolDescription(details: Record<string, unknown>, chinese: boolean): string {
  const parts: string[] = []
  if (typeof details.commandPreview === 'string') parts.push(`${chinese ? '命令' : 'Command'}: ${details.commandPreview}`)
  if (typeof details.path === 'string') parts.push(`${chinese ? '路径' : 'Path'}: ${details.path}`)
  if (typeof details.workingDirectory === 'string') parts.push(`${chinese ? '工作目录' : 'Working directory'}: ${details.workingDirectory}`)
  if (typeof details.workspaceId === 'string') parts.push(`Workspace: ${details.workspaceId}`)
  if (Array.isArray(details.files)) parts.push(`${chinese ? '文件' : 'Files'}: ${details.files.join(', ')}`)
  if (typeof details.additions === 'number' || typeof details.removals === 'number') parts.push(`+${details.additions ?? 0}/-${details.removals ?? 0}`)
  if (typeof details.sessionId === 'number') parts.push(`Session: ${details.sessionId}`)
  if (typeof details.inputLength === 'number') parts.push(`${chinese ? '输入字符' : 'Input characters'}: ${details.inputLength}`)
  if (typeof details.running === 'boolean') parts.push(details.running ? (chinese ? '进程运行中' : 'Process running') : `${chinese ? '进程已退出' : 'Process exited'} (${details.exitCode ?? '—'})`)
  if (typeof details.error === 'string') parts.push(`${chinese ? '错误' : 'Error'}: ${details.error}`)
  return parts.join('；') || (chinese ? '已执行' : 'Executed')
}

function markdownCell(value: string): string {
  return value.replace(/\|/g, '\\|').replace(/[\r\n]+/g, ' ')
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
