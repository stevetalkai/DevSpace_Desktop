import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { WindowsTailscaleInstall } from './WindowsTailscaleInstall'
import type { TailscaleInstallStatus } from '../../../shared/contracts'

function render(phase: TailscaleInstallStatus['phase'], errorCode: TailscaleInstallStatus['errorCode'] = null): string {
  return renderToStaticMarkup(<WindowsTailscaleInstall install={{ phase, errorCode, downloadedBytes: 50, totalBytes: 100 }} onInstall={() => {}} t={(key, ...values) => `${key} ${values.join(',')}`} />)
}

describe('Windows installer guidance', () => {
  it('offers the official installer without terminal commands', () => {
    const html = render('idle')
    expect(html).toContain('app.tailscale.setup.download_and_install')
    expect(html).not.toContain('winget install')
    expect(html).not.toContain('<pre>')
  })
  it('disables repeated downloads and displays progress', () => {
    expect(render('downloading')).toContain('disabled')
    expect(render('downloading')).toContain('app.tailscale.setup.downloading_percent 50')
  })
  it('distinguishes opening the installer from completing installation', () => {
    expect(render('installer-opened')).toContain('app.tailscale.setup.installer_opened')
    expect(render('installer-opened')).not.toContain('app.tailscale.setup.ready_title')
  })
  it('shows download and launch failures', () => {
    expect(render('failed', 'download_failed')).toContain('app.tailscale.setup.error.download_failed')
    expect(render('failed', 'installer_open_failed')).toContain('app.tailscale.setup.error.installer_open_failed')
  })
})
