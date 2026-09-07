import type { ActivityItem, ActivityKind, ActivityState } from '../../shared/contracts'

const DEFAULT_LIMIT = 50
const SAFE_DETAIL = /^[\p{L}\p{N}_.:-]{1,80}$/u

export interface ActivityStoreOptions {
  limit?: number
  now?: () => Date
}

export class ActivityStore {
  private readonly limit: number
  private readonly now: () => Date
  private readonly items: ActivityItem[] = []
  private sequence = 0

  constructor(options: ActivityStoreOptions = {}) {
    this.limit = options.limit ?? DEFAULT_LIMIT
    this.now = options.now ?? (() => new Date())
  }

  add(kind: ActivityKind, state: ActivityState, detail?: string): ActivityItem {
    const safeDetail = detail && SAFE_DETAIL.test(detail) ? detail : undefined
    const timestamp = this.now().toISOString()
    const group = activityGroup(kind)
    if (state === 'working') {
      const existing = this.findWorkingItem(group, safeDetail)
      if (existing) {
        existing.timestamp = timestamp
        return { ...existing }
      }
    } else {
      this.removeWorkingItems(group, safeDetail)
    }
    const previous = this.items.at(-1)
    if (previous?.kind === kind && previous.state === state && previous.detail === safeDetail) {
      previous.timestamp = timestamp
      return { ...previous }
    }

    const item: ActivityItem = {
      id: `${timestamp}-${this.sequence++}`,
      timestamp,
      kind,
      state,
      ...(safeDetail ? { detail: safeDetail } : {})
    }
    this.items.push(item)
    if (this.items.length > this.limit) this.items.splice(0, this.items.length - this.limit)
    return { ...item }
  }

  getSnapshot(): ActivityItem[] {
    return this.items.map((item) => ({ ...item }))
  }

  clearHistory(): void {
    for (let i = this.items.length - 1; i >= 0; i--) {
      if (this.items[i]?.state !== 'working') this.items.splice(i, 1)
    }
  }

  private removeWorkingItems(group: string, detail?: string): void {
    for (let index = this.items.length - 1; index >= 0; index -= 1) {
      const item = this.items[index]!
      if (item.state !== 'working' || activityGroup(item.kind) !== group) continue
      if (group === 'request' && detail && item.detail !== detail) continue
      this.items.splice(index, 1)
    }
  }

  private findWorkingItem(group: string, detail?: string): ActivityItem | undefined {
    for (let index = this.items.length - 1; index >= 0; index -= 1) {
      const item = this.items[index]!
      if (
        item.state === 'working'
        && activityGroup(item.kind) === group
        && (group !== 'request' || item.detail === detail)
      ) return item
    }
    return undefined
  }
}

function activityGroup(kind: ActivityKind): string {
  const separator = kind.indexOf('.')
  return separator === -1 ? kind : kind.slice(0, separator)
}
