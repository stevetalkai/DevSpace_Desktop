import { useState, type JSX } from 'react'

export function ClearHistoryButton({ target, disabled, t }: {
  target: 'activity' | 'tools'
  disabled: boolean
  t: (key: string) => string
}): JSX.Element {
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const clear = async (): Promise<void> => {
    setBusy(true)
    setFailed(false)
    try {
      if (await window.devspace.clearHistory(target)) setConfirming(false)
      else setFailed(true)
    } catch { setFailed(true) }
    finally { setBusy(false) }
  }
  return <div>
    {confirming ? <>
      <p>{t('app.history.confirm')}</p>
      <button className="secondary-button" disabled={busy} onClick={() => void clear()}>{t('app.history.confirm_button')}</button>
      <button className="secondary-button" disabled={busy} onClick={() => setConfirming(false)}>{t('app.common.cancel')}</button>
    </> : <button className="secondary-button" disabled={disabled} onClick={() => setConfirming(true)}>{t('app.history.clear')}</button>}
    {failed && <p role="alert">{t('app.history.failed')}</p>}
  </div>
}
