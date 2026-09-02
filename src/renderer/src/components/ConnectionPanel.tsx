import { AlertCircle, Check, Copy, ShieldCheck, Unplug } from 'lucide-react'
import type { JSX } from 'react'
import type { TunnelStatus } from '../../../shared/contracts'

interface ConnectionPanelProps {
  status: TunnelStatus
  coreRunning: boolean
  pending: boolean
  copied: boolean
  t: (key: string) => string
  onDetect: () => void
  onStart: () => void
  onStop: () => void
  onCopy: () => void
  onSetup: () => void
}

export function ConnectionPanel(props: ConnectionPanelProps): JSX.Element {
  const connected = props.status.phase === 'connected'
  const busy = props.pending || ['checking', 'starting', 'stopping'].includes(props.status.phase)

  return (
    <section className={`connection-panel ${connected ? 'connection-panel--connected' : ''}`}>
      <span className="connection-panel__icon">
        {connected ? <ShieldCheck size={21} /> : <Unplug size={21} />}
      </span>
      <div className="connection-panel__body">
        <div className="connection-panel__title">
          <h2>{props.t('app.status.tailscale.title')}</h2>
          <span>{props.t('app.tailscale.beta_risk_title')}</span>
        </div>
        {connected && props.status.mcpUrl ? (
          <code>{props.status.mcpUrl}</code>
        ) : (
          <p>{props.t('app.tailscale.beta_risk_description')}</p>
        )}
      </div>
      <div className="connection-panel__actions">
        {connected && (
          <button className="secondary-button" disabled={busy} onClick={props.onCopy}>
            {props.copied ? <Check size={16} /> : <Copy size={16} />}
            {props.copied ? props.t('app.common.done') : props.t('app.tailscale.copy_address')}
          </button>
        )}
        {['cli-missing', 'daemon-unavailable', 'not-logged-in', 'offline'].includes(props.status.phase) ? (
          <button className="secondary-button" onClick={props.onSetup}>
            <ShieldCheck size={16} />
            {props.t('app.tailscale.setup.open_wizard')}
          </button>
        ) : connected ? (
          <button className="connection-button connection-button--stop" disabled={busy} onClick={props.onStop}>
            {props.t('app.tailscale.stop_connection')}
          </button>
        ) : props.status.phase === 'ready' ? (
          <button className="connection-button" disabled={busy || !props.coreRunning} onClick={props.onStart}>
            {props.t('app.tailscale.enable_connection')}
          </button>
        ) : (
          <button className="secondary-button" disabled={busy} onClick={props.onDetect}>
            <AlertCircle size={16} />
            {props.t('app.tailscale.retry')}
          </button>
        )}
      </div>
    </section>
  )
}
