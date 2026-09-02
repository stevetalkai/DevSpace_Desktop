import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TailscaleSetupService } from './TailscaleSetupService'

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

describe('TailscaleSetupService', () => {
  it.each([
    ['win32', 'tailscale-setup-latest.exe'],
    ['darwin', 'Tailscale-latest-macos.pkg']
  ] as const)('downloads and opens the official installer on %s', async (platform, fileName) => {
    const root = await makeTempDirectory()
    const downloadFile = vi.fn(async (_url: string, _destination: string, onProgress: (downloaded: number, total: number) => void) => {
      onProgress(50, 100)
      onProgress(100, 100)
    })
    const openPath = vi.fn(async () => '')
    const service = new TailscaleSetupService({ platform, tempDirectory: root, downloadFile, openPath })

    await expect(service.install()).resolves.toMatchObject({ phase: 'installer-opened', downloadedBytes: 100, totalBytes: 100 })
    expect(downloadFile).toHaveBeenCalledWith(
      expect.stringMatching(/^https:\/\/pkgs\.tailscale\.com\/stable\//u),
      join(root, 'DevSpace Desktop', fileName),
      expect.any(Function)
    )
    expect(openPath).toHaveBeenCalledWith(join(root, 'DevSpace Desktop', fileName))
  })

  it('reports unsupported platforms without downloading anything', async () => {
    const downloadFile = vi.fn()
    const service = new TailscaleSetupService({
      platform: 'linux',
      tempDirectory: await makeTempDirectory(),
      downloadFile,
      openPath: vi.fn()
    })

    await expect(service.install()).resolves.toMatchObject({ phase: 'unsupported', errorCode: 'unsupported_platform' })
    expect(downloadFile).not.toHaveBeenCalled()
  })

  it('shares one in-flight installation between repeated clicks', async () => {
    let finishDownload: (() => void) | undefined
    const downloadFile = vi.fn(() => new Promise<void>((resolve) => { finishDownload = resolve }))
    const service = new TailscaleSetupService({
      platform: 'win32',
      tempDirectory: await makeTempDirectory(),
      downloadFile,
      openPath: vi.fn(async () => '')
    })

    const first = service.install()
    const second = service.install()
    expect(downloadFile).toHaveBeenCalledTimes(1)
    finishDownload?.()
    await Promise.all([first, second])
  })
})

async function makeTempDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'devspace-tailscale-setup-'))
  temporaryDirectories.push(directory)
  return directory
}
