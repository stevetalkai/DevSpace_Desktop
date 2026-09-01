import { useState, type JSX } from 'react'
import { Copy, FolderOpen, Settings, X } from 'lucide-react'
import type { DesktopSnapshot } from '../../../shared/contracts'

interface AdvancedPanelProps {
  snapshot: DesktopSnapshot
  t: (key: string, ...values: Array<string | number>) => string
  onClose: () => void
}

export function AdvancedPanel({ snapshot, t, onClose }: AdvancedPanelProps): JSX.Element {
  const [copied, setCopied] = useState(false)
  const [updating, setUpdating] = useState(false)

  const toggleLaunchAtLogin = async (): Promise<void> => {
    setUpdating(true)
    try {
      await window.devspace.setLaunchAtLogin(!snapshot.settings.launchAtLogin)
    } finally {
      setUpdating(false)
    }
  }

  const copyDiagnostics = async (): Promise<void> => {
    if (await window.devspace.copyDiagnostics()) setCopied(true)
  }

  return (
    <div className="dialog-backdrop" role="presentation">
      <section className="advanced-panel" role="dialog" aria-modal="true" aria-labelledby="advanced-title">
        <header>
          <div className="advanced-panel__title">
            <span><Settings size={19} /></span>
            <div>
              <h2 id="advanced-title">{t('app.advanced.title')}</h2>
              <p>{t('app.advanced.description')}</p>
            </div>
          </div>
          <button className="icon-button" onClick={onClose} aria-label={t('app.common.done')}><X size={18} /></button>
        </header>

        <dl className="technical-details">
          <div><dt>{t('app.advanced.port')}</dt><dd>{snapshot.core.port}</dd></div>
          <div><dt>{t('app.advanced.process_id')}</dt><dd>{snapshot.core.processId ?? t('app.advanced.not_available')}</dd></div>
          <div><dt>{t('app.advanced.endpoint')}</dt><dd>{snapshot.tunnel.mcpUrl ?? t('app.advanced.not_available')}</dd></div>
        </dl>

        <div className="setting-row">
          <div>
            <h3>{t('app.settings.launch_at_login')}</h3>
            <p>{t(snapshot.settings.launchAtLogin ? 'app.settings.launch_at_login.on' : 'app.settings.launch_at_login.off')}</p>
          </div>
          <button
            className={`switch-control ${snapshot.settings.launchAtLogin ? 'switch-control--on' : ''}`}
            role="switch"
            aria-checked={snapshot.settings.launchAtLogin}
            disabled={updating}
            onClick={() => void toggleLaunchAtLogin()}
          ><span /></button>
        </div>

        <div className="diagnostic-actions">
          <button className="secondary-button" onClick={() => void copyDiagnostics()}><Copy size={15} />{t(copied ? 'app.diagnostics.copied' : 'app.diagnostics.copy')}</button>
          <button className="secondary-button" onClick={() => void window.devspace.openLogsFolder()}><FolderOpen size={15} />{t('app.diagnostics.open_log_folder')}</button>
        </div>
      </section>
    </div>
  )
}
