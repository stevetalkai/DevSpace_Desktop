import { mkdtemp, readFile, readdir, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { DiagnosticLogStore, formatDiagnosticReport } from './DiagnosticLogStore'

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

    expect((await stat(logsDirectory)).mode & 0o777).toBe(0o700)
    expect((await stat(join(logsDirectory, 'diagnostic.log'))).mode & 0o777).toBe(0o600)
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
      expect((await stat(join(logsDirectory, file))).mode & 0o777).toBe(0o600)
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
})
