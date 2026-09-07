import type { JSX } from 'react'
import type { TailscaleInstallStatus } from '../../../shared/contracts'

export function WindowsTailscaleInstall({ install, onInstall, t }: {
  install: TailscaleInstallStatus
  onInstall: () => void
  t: (key: string, ...values: Array<string | number>) => string
}): JSX.Element {
  const busy = install.phase === 'downloading' || install.phase === 'opening-installer'
  return <>
    <p>{t('app.tailscale.setup.install_description')}</p>
    <p>{t('app.tailscale.cli.windows')}</p>
    <button className="primary-button" disabled={busy} onClick={onInstall}>
      {t(busy ? 'app.tailscale.setup.installing' : 'app.tailscale.setup.download_and_install')}
    </button>
    {install.phase === 'downloading' && <p role="status">{install.totalBytes
      ? t('app.tailscale.setup.downloading_percent', Math.min(100, Math.floor(100 * install.downloadedBytes / install.totalBytes)))
      : t('app.tailscale.setup.downloading')}</p>}
    {install.phase === 'installer-opened' && <p role="status">{t('app.tailscale.setup.installer_opened')}</p>}
    {install.phase === 'failed' && <p role="alert">{t(`app.tailscale.setup.error.${install.errorCode}`)}</p>}
  </>
}
