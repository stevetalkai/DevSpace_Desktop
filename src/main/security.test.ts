import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('renderer isolation', () => {
  it('keeps Node.js disabled and context isolation enabled', () => {
    const source = readFileSync(join(process.cwd(), 'src/main/index.ts'), 'utf8')
    expect(source).toContain('contextIsolation: true')
    expect(source).toContain('nodeIntegration: false')
    expect(source).toContain('sandbox: true')
  })

  it('does not expose a generic command or IPC method', () => {
    const source = readFileSync(join(process.cwd(), 'src/preload/index.ts'), 'utf8')
    expect(source).not.toMatch(/execute|sendMessage|child_process|\bfs\b/)
    expect(source).toContain("contextBridge.exposeInMainWorld('devspace', api)")
  })
})
