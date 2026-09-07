import { mkdtemp, readFile, readdir, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { DiagnosticLogStore, formatActivityReport, formatDiagnosticReport } from './DiagnosticLogStore'

const temporaryDirectories: string[] = []

async function makeTemporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'devspace-diagnostics-'))
  temporaryDirectories.push(directory)
  return directory
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

describe('DiagnosticLogStore', () => {
  it('clears persisted tool history and preserves other logs and subsequent calls', async () => {
    const logsDirectory = await makeTemporaryDirectory()
    const store = new DiagnosticLogStore({ logsDirectory, maxFileBytes: 250 })
    await store.append('info', 'core', 'service_started')
    await store.append('info', 'core', 'tool_call', { tool: 'read' })
    const queued = store.append('info', 'core', 'tool_call', { tool: 'old' })
    const clearing = store.clearToolHistory()
    const subsequent = store.append('info', 'core', 'tool_call', { tool: 'new' })
    await Promise.all([queued, clearing, subsequent])
    const restored = new DiagnosticLogStore({ logsDirectory })
    const events = await restored.getReportEvents()
    expect(events.map(event => event.message)).toEqual(['service_started', 'tool_call'])
    expect(events[1]?.details).toEqual({ tool: 'new' })
    expect(store.getRecent().map(event => event.message)).toEqual(['service_started', 'tool_call'])
  })

  it('keeps only the 500 most recent structured events in memory', async () => {
    const store = new DiagnosticLogStore({ now: () => new Date('2026-09-02T01:02:03.000Z') })

    for (let index = 0; index < 505; index += 1) {
      await store.append('info', 'core', `event-${index}`, { index })
    }

    const events = store.getRecent()
    expect(events).toHaveLength(500)
    expect(events[0]).toMatchObject({ level: 'info', source: 'core', message: 'event-5', details: { index: 5 } })
    expect(events.at(-1)?.message).toBe('event-504')
    expect(events[0]?.timestamp).toBe('2026-09-02T01:02:03.000Z')
  })

  it('redacts sensitive detail fields before retaining or persisting an event', async () => {
    const root = await makeTemporaryDirectory()
    const logsDirectory = join(root, 'userData', 'logs')
    const store = new DiagnosticLogStore({ logsDirectory })

    await store.append('warn', 'connection', 'Authorization failed', {
      ownerToken: 'plain-owner-token',
      nested: { Password: 'plain-password', safe: 'visible' },
      items: [{ authorizationHeader: 'Bearer private-value' }]
    })

    expect(store.getRecent()[0]?.details).toEqual({
      ownerToken: '[REDACTED]',
      nested: { Password: '[REDACTED]', safe: 'visible' },
      items: [{ authorizationHeader: '[REDACTED]' }]
    })
    const diskContents = await readFile(join(logsDirectory, 'diagnostic.log'), 'utf8')
    expect(diskContents).not.toContain('plain-owner-token')
    expect(diskContents).not.toContain('plain-password')
    expect(diskContents).not.toContain('private-value')
  })

  it('creates private log directories and files', async () => {
    const root = await makeTemporaryDirectory()
    const logsDirectory = join(root, 'userData', 'logs')
    const store = new DiagnosticLogStore({ logsDirectory })

    await store.append('error', 'tunnel', 'Unable to start tunnel')

    if (process.platform !== 'win32') {
      expect((await stat(logsDirectory)).mode & 0o777).toBe(0o700)
      expect((await stat(join(logsDirectory, 'diagnostic.log'))).mode & 0o777).toBe(0o600)
    }
  })

  it('rotates persisted logs and keeps no more than three files', async () => {
    const root = await makeTemporaryDirectory()
    const logsDirectory = join(root, 'logs')
    const store = new DiagnosticLogStore({
      logsDirectory,
      maxFileBytes: 180,
      now: () => new Date('2026-09-02T01:02:03.000Z')
    })

    for (let index = 0; index < 12; index += 1) {
      await store.append('info', 'rotation', `event-${index}-${'x'.repeat(30)}`)
    }

    const files = (await readdir(logsDirectory)).sort()
    expect(files).toEqual(['diagnostic.log', 'diagnostic.log.1', 'diagnostic.log.2'])
    for (const file of files) {
      expect((await stat(join(logsDirectory, file))).size).toBeLessThanOrEqual(180)
      if (process.platform !== 'win32') expect((await stat(join(logsDirectory, file))).mode & 0o777).toBe(0o600)
    }
    expect(await readFile(join(logsDirectory, 'diagnostic.log'), 'utf8')).toContain('event-11-')
  })

  it('formats a report and recursively redacts sensitive snapshot fields', () => {
    const report = formatDiagnosticReport(
      {
        service: { state: 'running', ownerPassword: 'hidden-password' },
        authorization: 'Bearer hidden-auth',
        projects: [{ name: 'Example', cookieJar: { session: 'hidden-cookie' } }],
        safe: 'visible'
      },
      '1.2.3'
    )
    const parsed = JSON.parse(report) as Record<string, unknown>

    expect(parsed).toEqual({
      appVersion: '1.2.3',
      snapshot: {
        service: { state: 'running', ownerPassword: '[REDACTED]' },
        authorization: '[REDACTED]',
        projects: [{ name: 'Example', cookieJar: '[REDACTED]' }],
        safe: 'visible'
      }
    })
    expect(report).not.toContain('hidden-password')
    expect(report).not.toContain('hidden-auth')
    expect(report).not.toContain('hidden-cookie')
  })

  it('loads persisted events for reports after creating a new store', async () => {
    const root = await makeTemporaryDirectory()
    const logsDirectory = join(root, 'logs')
    const first = new DiagnosticLogStore({ logsDirectory })
    await first.append('info', 'core', 'tool_call', { tool: 'read', success: true })

    const reopened = new DiagnosticLogStore({ logsDirectory })
    expect(await reopened.getReportEvents()).toMatchObject([
      { source: 'core', message: 'tool_call', details: { tool: 'read', success: true } }
    ])
  })

  it('formats a readable activity report with command, result, duration, and redaction', () => {
    const report = formatActivityReport(
      { core: { phase: 'running' }, ownerPassword: 'hidden' },
      [{
        timestamp: '2026-09-02T12:00:01.000Z',
        level: 'info',
        source: 'core',
        message: 'tool_call',
        details: {
          tool: 'exec_command',
          workspaceId: 'ws_test',
          commandPreview: 'npm test',
          durationMs: 42,
          success: true,
          accessToken: 'secret-token'
        }
      }],
      '1.2.3',
      'zh-Hans',
      new Date('2026-09-02T12:01:00.000Z')
    )

    expect(report).toContain('# DevSpace 活动报告')
    expect(report).toContain('exec_command')
    expect(report).toContain('命令: npm test')
    expect(report).toContain('42 ms')
    expect(report).toContain('## 运行概览')
    expect(report).toContain('| 本地服务 | running |')
    expect(report).not.toContain('```json')
    expect(report).not.toContain('ownerPassword')
    expect(report).not.toContain('accessToken')
    expect(report).not.toContain('secret-token')
    expect(report).not.toContain('hidden')
  })
})
