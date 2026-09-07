import { useState, type JSX } from 'react'

interface Props {
  action: 'install' | 'service' | 'login'
  source?: 'official' | 'ustc'
  t: (key: string) => string
}

export function TailscaleCommandButton({ action, source = 'official', t }: Props): JSX.Element {
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const run = async (): Promise<void> => {
    setBusy(true)
    setFailed(false)
    try { setFailed(!await window.devspace.runTailscaleCommand(action, source)) }
    catch { setFailed(true) }
    finally { setBusy(false) }
  }
  return <div>
    <button className="secondary-button" disabled={busy} onClick={() => void run()}>
      {t(busy ? action === 'login' ? 'app.tailscale.terminal.login_waiting' : 'app.tailscale.terminal.opening' : `app.tailscale.terminal.${action}`)}
    </button>
    {failed && <p role="alert">{t(action === 'login' ? 'app.tailscale.terminal.login_failed' : 'app.tailscale.terminal.failed')}</p>}
  </div>
}
