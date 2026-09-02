import { describe, expect, it } from 'vitest'
import { ToolCallStore } from './ToolCallStore'

describe('ToolCallStore', () => {
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
