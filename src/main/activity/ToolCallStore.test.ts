import { describe, expect, it } from 'vitest'
import { ToolCallStore } from './ToolCallStore'

describe('ToolCallStore', () => {
  it('preserves running calls and completes them after clearing history', () => {
    const store = new ToolCallStore()
    store.complete({ ts: '2026-09-02T12:00:00.000Z', level: 'info', event: 'tool_call', tool: 'read', success: true })
    store.start('exec_command', '2026-09-02T12:00:01.000Z')
    store.clearHistory()
    expect(store.getSnapshot()).toMatchObject([{ tool: 'exec_command', state: 'working', sequence: 2 }])
    store.complete({ ts: '2026-09-02T12:00:02.000Z', level: 'info', event: 'tool_call', tool: 'exec_command', success: true })
    expect(store.getSnapshot()).toMatchObject([{ tool: 'exec_command', state: 'success', sequence: 2 }])
  })

  it('pairs a completed tool event with its pending row', () => {
    const store = new ToolCallStore()
    store.start('exec_command', '2026-09-02T12:00:00.000Z')
    store.complete({
      ts: '2026-09-02T12:00:00.125Z', level: 'info', event: 'tool_call',
      tool: 'exec_command', success: true, commandPreview: 'npm test', exitCode: 0
    })

    expect(store.getSnapshot()).toMatchObject([{
      sequence: 1, tool: 'exec_command', state: 'success', durationMs: 125,
      commandPreview: 'npm test', exitCode: 0
    }])
  })

  it('keeps failed calls and their readable error details', () => {
    const store = new ToolCallStore()
    store.complete({
      ts: '2026-09-02T12:00:01.000Z', level: 'error', event: 'tool_call',
      tool: 'read', success: false, path: 'missing.txt', error: 'File not found'
    })

    expect(store.getSnapshot()[0]).toMatchObject({
      sequence: 1, tool: 'read', state: 'error', path: 'missing.txt', error: 'File not found'
    })
  })
})
