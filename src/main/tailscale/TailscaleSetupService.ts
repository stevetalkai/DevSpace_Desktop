import { EventEmitter } from 'node:events'
import { createWriteStream, mkdirSync } from 'node:fs'
import { get } from 'node:https'
import { join } from 'node:path'
import { Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import type { TailscaleInstallStatus } from '../../shared/contracts'

const INSTALLERS = {
  win32: {
    url: 'https://pkgs.tailscale.com/stable/tailscale-setup-latest.exe',
    fileName: 'tailscale-setup-latest.exe'
  },
  darwin: {
    url: 'https://pkgs.tailscale.com/stable/Tailscale-latest-macos.pkg',
    fileName: 'Tailscale-latest-macos.pkg'
  }
} as const

type SupportedPlatform = keyof typeof INSTALLERS
type DownloadFile = (
  url: string,
  destination: string,
  onProgress: (downloadedBytes: number, totalBytes: number | null) => void
) => Promise<void>

export interface TailscaleSetupServiceOptions {
  platform: NodeJS.Platform
  tempDirectory: string
  openPath: (path: string) => Promise<string>
  downloadFile?: DownloadFile
}

export class TailscaleSetupService extends EventEmitter {
  private status: TailscaleInstallStatus = idleStatus()
  private installPromise: Promise<TailscaleInstallStatus> | null = null

  constructor(private readonly options: TailscaleSetupServiceOptions) {
    super()
  }

  getStatus(): TailscaleInstallStatus {
    return { ...this.status }
  }

  install(): Promise<TailscaleInstallStatus> {
    if (this.installPromise) return this.installPromise
    this.installPromise = this.runInstall().finally(() => {
      this.installPromise = null
    })
    return this.installPromise
  }

  private async runInstall(): Promise<TailscaleInstallStatus> {
    const platform = this.options.platform
    if (!isSupportedPlatform(platform) || platform === 'darwin') {
      return this.update({ phase: 'unsupported', downloadedBytes: 0, totalBytes: null, errorCode: 'unsupported_platform' })
    }

    const installer = INSTALLERS[platform]
    const downloadDirectory = join(this.options.tempDirectory, 'DevSpace Desktop')
    const destination = join(downloadDirectory, installer.fileName)
    mkdirSync(downloadDirectory, { recursive: true })
    this.update({ phase: 'downloading', downloadedBytes: 0, totalBytes: null, errorCode: null })

    try {
      await (this.options.downloadFile ?? downloadHttps)(installer.url, destination, (downloadedBytes, totalBytes) => {
        this.update({ phase: 'downloading', downloadedBytes, totalBytes, errorCode: null })
      })
    } catch {
      return this.update({ phase: 'failed', downloadedBytes: 0, totalBytes: null, errorCode: 'download_failed' })
    }

    this.update({ ...this.status, phase: 'opening-installer' })
    const errorMessage = await this.options.openPath(destination)
    if (errorMessage) {
      return this.update({ ...this.status, phase: 'failed', errorCode: 'installer_open_failed' })
    }
    return this.update({ ...this.status, phase: 'installer-opened', errorCode: null })
  }

  private update(status: TailscaleInstallStatus): TailscaleInstallStatus {
    this.status = status
    const snapshot = this.getStatus()
    this.emit('status', snapshot)
    return snapshot
  }
}

function idleStatus(): TailscaleInstallStatus {
  return { phase: 'idle', downloadedBytes: 0, totalBytes: null, errorCode: null }
}

function isSupportedPlatform(platform: NodeJS.Platform): platform is SupportedPlatform {
  return platform === 'win32' || platform === 'darwin'
}

function downloadHttps(
  url: string,
  destination: string,
  onProgress: (downloadedBytes: number, totalBytes: number | null) => void,
  redirectsRemaining = 5
): Promise<void> {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url)
    if (parsedUrl.protocol !== 'https:' || parsedUrl.hostname !== 'pkgs.tailscale.com') {
      reject(new Error('Untrusted Tailscale installer URL'))
      return
    }

    const request = get(parsedUrl, (response) => {
      if (response.statusCode && response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        response.resume()
        if (redirectsRemaining === 0) {
          reject(new Error('Too many installer redirects'))
          return
        }
        const redirectUrl = new URL(response.headers.location, parsedUrl).toString()
        void downloadHttps(redirectUrl, destination, onProgress, redirectsRemaining - 1).then(resolve, reject)
        return
      }
      if (response.statusCode !== 200) {
        response.resume()
        reject(new Error(`Installer download failed with HTTP ${response.statusCode ?? 'unknown'}`))
        return
      }

      const contentLength = Number(response.headers['content-length'])
      const totalBytes = Number.isFinite(contentLength) && contentLength > 0 ? contentLength : null
      let downloadedBytes = 0
      let lastReportedAt = 0
      const progress = new Transform({
        transform(chunk: Buffer, _encoding, callback) {
          downloadedBytes += chunk.length
          const now = Date.now()
          if (now - lastReportedAt >= 100 || downloadedBytes === totalBytes) {
            lastReportedAt = now
            onProgress(downloadedBytes, totalBytes)
          }
          callback(null, chunk)
        }
      })
      void pipeline(response, progress, createWriteStream(destination, { mode: 0o600 })).then(() => {
        onProgress(downloadedBytes, totalBytes)
        resolve()
      }, reject)
    })
    request.setTimeout(120_000, () => request.destroy(new Error('Installer download timed out')))
    request.once('error', reject)
  })
}
