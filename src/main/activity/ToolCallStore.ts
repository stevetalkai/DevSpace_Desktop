import { randomUUID } from 'node:crypto'
import type { ToolCallItem } from '../../shared/contracts'
import type { CoreStructuredEvent } from '../chatgpt/ChatGPTConnectionMonitor'

const DETAIL_KEYS = [
  'workspaceId', 'path', 'workingDirectory', 'commandPreview', 'files',
  'additions', 'removals', 'sessionId', 'running', 'exitCode', 'error'
] as const

export class ToolCallStore {
  private readonly items: ToolCallItem[] = []
  private sequence = 0

  constructor(private readonly limit = 100) {}

  start(tool: string, timestamp = new Date().toISOString()): void {
    this.items.push({
      id: randomUUID(),
      sequence: ++this.sequence,
      timestamp,
      tool,
      state: 'working'
    })
    this.trim()
  }

  complete(event: CoreStructuredEvent): void {
    const tool = typeof event.tool === 'string' ? event.tool : 'unknown'
    const completedAt = validTimestamp(event.ts)
    const pending = [...this.items].reverse().find((item) => item.tool === tool && item.state === 'working')
    const target = pending ?? {
      id: randomUUID(),
      sequence: ++this.sequence,
      timestamp: completedAt,
      tool,
      state: 'working' as const
    }

    target.completedAt = completedAt
    target.state = event.success === false ? 'error' : 'success'
    if (typeof event.durationMs === 'number') target.durationMs = event.durationMs
    else target.durationMs = Math.max(0, Date.parse(completedAt) - Date.parse(target.timestamp))
    for (const key of DETAIL_KEYS) {
      const value = event[key]
      if (isToolCallDetail(key, value)) Object.assign(target, { [key]: value })
    }
    if (!pending) this.items.push(target)
    this.trim()
  }

  getSnapshot(): ToolCallItem[] {
    return this.items.map((item) => ({ ...item, files: item.files ? [...item.files] : undefined }))
  }

  clearHistory(ids = new Set(this.items.filter((item) => item.state !== 'working').map((item) => item.id))): void {
    for (let i = this.items.length - 1; i >= 0; i--) {
      if (ids.has(this.items[i]!.id) && this.items[i]?.state !== 'working') this.items.splice(i, 1)
    }
  }

  private trim(): void {
    if (this.items.length > this.limit) this.items.splice(0, this.items.length - this.limit)
  }
}

function validTimestamp(value: unknown): string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value)) ? value : new Date().toISOString()
}

function isToolCallDetail(key: typeof DETAIL_KEYS[number], value: unknown): boolean {
  if (key === 'files') return Array.isArray(value) && value.every((item) => typeof item === 'string')
  if (key === 'additions' || key === 'removals' || key === 'sessionId' || key === 'exitCode') return typeof value === 'number'
  if (key === 'running') return typeof value === 'boolean'
  return typeof value === 'string'
}
