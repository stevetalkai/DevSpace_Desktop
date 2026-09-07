import { describe, expect, it } from 'vitest'
import { ActivityStore } from './ActivityStore'

describe('ActivityStore', () => {
  it('clears completed history while preserving running tasks and future updates', () => {
    const store = new ActivityStore()
    store.add('core.starting', 'working')
    store.add('chatgpt.configured', 'success')
    store.clearHistory()
    expect(store.getSnapshot()).toMatchObject([{ kind: 'core.starting', state: 'working' }])
    store.add('core.running', 'success')
    expect(store.getSnapshot()).toMatchObject([{ kind: 'core.running', state: 'success' }])
  })

  it('keeps a bounded chronological activity list', () => {
    let second = 0
    const store = new ActivityStore({ limit: 2, now: () => new Date(second++ * 1_000) })
    store.add('core.starting', 'working')
    store.add('core.running', 'success')
    store.add('tunnel.connected', 'success')

    expect(store.getSnapshot().map((item) => item.kind)).toEqual(['core.running', 'tunnel.connected'])
  })

  it('coalesces repeated statuses and rejects unsafe detail text', () => {
    let second = 0
    const store = new ActivityStore({ now: () => new Date(second++ * 1_000) })
    store.add('request.completed', 'success', 'open_workspace')
    store.add('request.completed', 'success', 'open_workspace')
    store.add('request.failed', 'error', 'C:\\private path')

    const items = store.getSnapshot()
    expect(items).toHaveLength(2)
    expect(items[0]).toMatchObject({ detail: 'open_workspace', timestamp: '1970-01-01T00:00:01.000Z' })
    expect(items[1]?.detail).toBeUndefined()
  })

  it('replaces unfinished progress with the final result for the same subsystem', () => {
    const store = new ActivityStore()
    store.add('core.starting', 'working')
    store.add('chatgpt.configured', 'success')
    store.add('core.running', 'success')

    expect(store.getSnapshot().map((item) => item.kind)).toEqual(['chatgpt.configured', 'core.running'])
  })

  it('settles only the matching tool when multiple operations are active', () => {
    const store = new ActivityStore()
    store.add('request.tool_started', 'working', 'read')
    store.add('request.tool_started', 'working', 'exec_command')
    store.add('request.completed', 'success', 'read')

    expect(store.getSnapshot()).toMatchObject([
      { kind: 'request.tool_started', state: 'working', detail: 'exec_command' },
      { kind: 'request.completed', state: 'success', detail: 'read' }
    ])
  })

  it('coalesces retry attempts for the same running tool even when other activity is interleaved', () => {
    let second = 0
    const store = new ActivityStore({ now: () => new Date(second++ * 1_000) })
    store.add('request.tool_started', 'working', 'open_workspace')
    store.add('chatgpt.connected', 'success')
    store.add('request.tool_started', 'working', 'open_workspace')

    expect(store.getSnapshot()).toMatchObject([
      {
        kind: 'request.tool_started',
        state: 'working',
        detail: 'open_workspace',
        timestamp: '1970-01-01T00:00:02.000Z'
      },
      { kind: 'chatgpt.connected', state: 'success' }
    ])
  })
})
