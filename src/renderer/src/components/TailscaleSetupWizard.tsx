import { Check, CircleAlert, Download, ExternalLink, LoaderCircle, ShieldCheck, X } from 'lucide-react'
import type { JSX } from 'react'
import type { TailscaleInstallStatus, TunnelStatus } from '../../../shared/contracts'

interface TailscaleSetupWizardProps {
  tunnel: TunnelStatus
  install: TailscaleInstallStatus
  detecting: boolean
  applicationInstalled: boolean
  t: (key: string, ...values: Array<string | number>) => string
  onInstall: () => void
  onOpenApp: () => void
  onDetect: () => void
  onClose: () => void
}

type CheckState = 'complete' | 'current' | 'pending'

export function TailscaleSetupWizard(props: TailscaleSetupWizardProps): JSX.Element {
  const { installed, running, loggedIn } = deriveTailscaleChecks(props.tunnel.phase)
  const progress = props.install.totalBytes
    ? Math.min(100, Math.round((props.install.downloadedBytes / props.install.totalBytes) * 100))
    : null
  const installBusy = props.install.phase === 'downloading' || props.install.phase === 'opening-installer'

  return (
    <div className="dialog-backdrop" role="presentation">
      <section className="tailscale-setup" role="dialog" aria-modal="true" aria-labelledby="tailscale-setup-title">
        <div className="chatgpt-wizard__header">
          <div className="chatgpt-wizard__identity">
            <span><ShieldCheck size={20} /></span>
            <div>
              <p className="eyebrow">Tailscale</p>
              <h2 id="tailscale-setup-title">{props.t('app.tailscale.setup.title')}</h2>
            </div>
          </div>
          <button className="icon-button" onClick={props.onClose} aria-label={props.t('app.common.cancel')}><X size={18} /></button>
        </div>

        <p className="tailscale-setup__intro">{props.t('app.tailscale.setup.intro')}</p>

        <ol className="setup-checks" aria-label={props.t('app.tailscale.setup.environment_check')}>
          <SetupCheck
            state={installed ? 'complete' : 'current'}
            label={props.t('app.tailscale.setup.check.client')}
            value={props.t(installed ? 'app.tailscale.setup.check.installed' : 'app.tailscale.setup.check.not_installed')}
          />
          <SetupCheck
            state={running ? 'complete' : installed ? 'current' : 'pending'}
            label={props.t('app.tailscale.setup.check.service')}
            value={props.t(running ? 'app.tailscale.setup.check.running' : 'app.tailscale.setup.check.waiting')}
          />
          <SetupCheck
            state={loggedIn ? 'complete' : running ? 'current' : 'pending'}
            label={props.t('app.tailscale.setup.check.account')}
            value={props.t(loggedIn ? 'app.tailscale.setup.check.signed_in' : 'app.tailscale.setup.check.sign_in_required')}
          />
        </ol>

        <div className="tailscale-setup__action">
          {!installed ? (
            <>
              <h3>{props.t('app.tailscale.setup.install_title')}</h3>
              <p>{props.t('app.tailscale.setup.install_description')}</p>
              {props.install.phase === 'downloading' && (
                <div className="download-progress" aria-live="polite">
                  <div><span style={{ width: `${progress ?? 12}%` }} /></div>
                  <p>{progress === null
                    ? props.t('app.tailscale.setup.downloading')
                    : props.t('app.tailscale.setup.downloading_percent', progress)}</p>
                </div>
              )}
              {props.install.phase === 'installer-opened' && (
                <div className="setup-notice setup-notice--success"><Check size={16} /> {props.t('app.tailscale.setup.installer_opened')}</div>
              )}
              {props.install.phase === 'failed' && (
                <div className="setup-notice setup-notice--error"><CircleAlert size={16} /> {props.t(`app.tailscale.setup.error.${props.install.errorCode}`)}</div>
              )}
              <div className="tailscale-setup__buttons">
                <button className="primary-button" disabled={installBusy} onClick={props.onInstall}>
                  {installBusy ? <LoaderCircle className="spin" size={16} /> : <Download size={16} />}
                  {props.t(installBusy ? 'app.tailscale.setup.installing' : 'app.tailscale.setup.download_and_install')}
                </button>
                {props.install.phase === 'installer-opened' && (
                  <button className="secondary-button" disabled={props.detecting} onClick={props.onDetect}>
                    {props.detecting && <LoaderCircle className="spin" size={15} />}
                    {props.t(props.detecting ? 'app.tailscale.setup.detecting' : 'app.tailscale.setup.installed_check')}
                  </button>
                )}
              </div>
            </>
          ) : props.tunnel.phase === 'daemon-unavailable' ? (
            <>
              <h3>{props.t('app.tailscale.setup.open_title')}</h3>
              <p>{props.t(props.applicationInstalled
                ? 'app.tailscale.setup.open_description'
                : 'app.tailscale.setup.start_cli_description')}</p>
              <div className="tailscale-setup__buttons">
                <button className="primary-button" onClick={props.onOpenApp}><ExternalLink size={16} /> {props.t(props.applicationInstalled
                  ? 'app.tailscale.setup.open_app'
                  : 'app.tailscale.setup.start_cli')}</button>
                <button className="secondary-button" disabled={props.detecting} onClick={props.onDetect}>
                  {props.detecting && <LoaderCircle className="spin" size={15} />}
                  {props.t(props.detecting ? 'app.tailscale.setup.detecting' : 'app.common.retry')}
                </button>
              </div>
            </>
          ) : props.tunnel.phase === 'coordination-unavailable' ? (
            <>
              <h3>{props.t('app.tailscale.setup.network_title')}</h3>
              <div className="setup-notice setup-notice--error"><CircleAlert size={16} /> {props.t(
                props.tunnel.errorCode === 'proxy_dns_conflict'
                  ? 'app.tailscale.setup.proxy_dns_description'
                  : 'app.tailscale.setup.network_description'
              )}</div>
              <button className="secondary-button" disabled={props.detecting} onClick={props.onDetect}>
                {props.detecting && <LoaderCircle className="spin" size={15} />}
                {props.t(props.detecting ? 'app.tailscale.setup.detecting' : 'app.common.retry')}
              </button>
            </>
          ) : props.tunnel.phase === 'not-logged-in' || props.tunnel.phase === 'offline' ? (
            <>
              <h3>{props.t('app.tailscale.setup.login_title')}</h3>
              <p>{props.t(props.applicationInstalled
                ? 'app.tailscale.setup.login_description'
                : 'app.tailscale.setup.login_cli_description')}</p>
              <div className="tailscale-setup__buttons">
                <button className="primary-button" onClick={props.onOpenApp}><ExternalLink size={16} /> {props.t(props.applicationInstalled
                  ? 'app.tailscale.login'
                  : 'app.tailscale.setup.login_cli')}</button>
                <button className="secondary-button" disabled={props.detecting} onClick={props.onDetect}>
                  {props.detecting && <LoaderCircle className="spin" size={15} />}
                  {props.t(props.detecting ? 'app.tailscale.setup.detecting' : 'app.tailscale.setup.login_check')}
                </button>
              </div>
            </>
          ) : loggedIn ? (
            <>
              <div className="setup-complete"><Check size={18} /> <div><h3>{props.t('app.tailscale.setup.ready_title')}</h3><p>{props.t('app.tailscale.setup.ready_description')}</p></div></div>
              <button className="primary-button tailscale-setup__done" onClick={props.onClose}>{props.t('app.common.done')}</button>
            </>
          ) : (
            <>
              <h3>{props.t('app.tailscale.setup.problem_title')}</h3>
              <p>{props.t('app.tailscale.setup.problem_description')}</p>
              <button className="secondary-button" disabled={props.detecting} onClick={props.onDetect}>
                {props.detecting && <LoaderCircle className="spin" size={15} />}
                {props.t(props.detecting ? 'app.tailscale.setup.detecting' : 'app.common.retry')}
              </button>
            </>
          )}
        </div>
      </section>
    </div>
  )
}

export function deriveTailscaleChecks(
  phase: TunnelStatus['phase']
): { installed: boolean; running: boolean; loggedIn: boolean } {
  const loggedIn = ['ready', 'starting', 'connected', 'stopping'].includes(phase)
  const installed = phase !== 'cli-missing' && phase !== 'checking'
  const running = ['coordination-unavailable', 'not-logged-in', 'offline', 'ready', 'starting', 'connected', 'stopping'].includes(phase)
  return { installed, running, loggedIn }
}

function SetupCheck({ state, label, value }: { state: CheckState; label: string; value: string }): JSX.Element {
  return (
    <li className={`setup-check setup-check--${state}`}>
      <span>{state === 'complete' ? <Check size={14} /> : state === 'current' ? <LoaderCircle size={14} /> : null}</span>
      <strong>{label}</strong>
      <small>{value}</small>
    </li>
  )
}
