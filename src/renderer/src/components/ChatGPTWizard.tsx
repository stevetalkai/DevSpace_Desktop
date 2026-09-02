import { useState, type JSX } from 'react'
import { AlertCircle, Bot, Check, Copy, ExternalLink, KeyRound, X } from 'lucide-react'
import type { ChatGPTStatus } from '../../../shared/contracts'
import enableDeveloperModeGuide from '../assets/chatgpt-guide/01-enable-developer-mode.png'
import openCreateAppGuide from '../assets/chatgpt-guide/02-open-create-app.png'
import fillCreateAppGuide from '../assets/chatgpt-guide/03-fill-create-app-form.png'
import confirmAppLoginGuide from '../assets/chatgpt-guide/04-confirm-app-login.png'
import authorizeDevSpaceGuide from '../assets/chatgpt-guide/04-authorize-devspace.png'

interface ChatGPTWizardProps {
  mcpUrl: string
  status: ChatGPTStatus
  t: (key: string, ...values: Array<string | number>) => string
  onClose: () => void
}

const statusKeys: Record<ChatGPTStatus['phase'], string> = {
  'not-connected': 'app.chatgpt.wizard.status.preparing',
  'waiting-request': 'app.chatgpt.wizard.status.waiting_for_request',
  'waiting-authorization': 'app.chatgpt.wizard.status.waiting_for_authorization',
  configured: 'app.chatgpt.wizard.status.configured',
  connected: 'app.chatgpt.wizard.status.connected',
  stale: 'app.chatgpt.wizard.status.expired'
}

export function ChatGPTWizard({ mcpUrl, status, t, onClose }: ChatGPTWizardProps): JSX.Element {
  const [addressCopied, setAddressCopied] = useState(false)
  const [passwordCopied, setPasswordCopied] = useState(false)
  const [developerModeSettingsOpened, setDeveloperModeSettingsOpened] = useState(false)
  const [chatgptOpened, setChatgptOpened] = useState(false)

  const copyAddress = async (): Promise<void> => {
    if (await window.devspace.copyMcpUrl()) setAddressCopied(true)
  }

  const copyPassword = async (): Promise<void> => {
    if (await window.devspace.copyOwnerPassword()) setPasswordCopied(true)
  }

  const openChatGPT = async (): Promise<void> => {
    await window.devspace.openChatGPT()
    setChatgptOpened(true)
  }

  const openDeveloperModeSettings = async (): Promise<void> => {
    await window.devspace.openChatGPTDeveloperMode()
    setDeveloperModeSettingsOpened(true)
  }

  const continueSetup = async (): Promise<void> => {
    await window.devspace.beginChatGPTSetup()
    await openChatGPT()
  }

  const finishOrContinue = (): void => {
    if (connected) {
      onClose()
      return
    }
    void continueSetup()
  }

  const requestReachedDevSpace = ['waiting-authorization', 'configured', 'connected', 'stale'].includes(status.phase)
  const connected = status.phase === 'connected'
  const authorized = connected || status.phase === 'configured'
  const reconnecting = status.phase === 'stale' || (status.phase === 'not-connected' && status.lastConnectedAt !== null)
  const canContinue = status.phase === 'waiting-request' || status.phase === 'configured' || reconnecting

  return (
    <div className="dialog-backdrop" role="presentation">
      <section className="chatgpt-wizard" role="dialog" aria-modal="true" aria-labelledby="chatgpt-wizard-title">
        <div className="chatgpt-wizard__header">
          <div className="chatgpt-wizard__identity">
            <span><Bot size={20} /></span>
            <div>
              <p className="eyebrow">MCP</p>
              <h2 id="chatgpt-wizard-title">{t('app.chatgpt.wizard.title')}</h2>
            </div>
          </div>
          <button className="icon-button" onClick={onClose} aria-label={t('app.common.cancel')}><X size={18} /></button>
        </div>

        <div className={`wizard-live-state wizard-live-state--${status.phase}`}>
          <i /> {t(statusKeys[status.phase])}
        </div>

        {reconnecting && (
          <div className="wizard-recovery" role="alert">
            <AlertCircle size={17} />
            <div><strong>{t('app.chatgpt.wizard.connection_interrupted_title')}</strong><p>{t('app.chatgpt.wizard.connection_interrupted_description')}</p></div>
          </div>
        )}

        <div className="wizard-requirement">
          <AlertCircle size={17} />
          <p><strong>{t('app.chatgpt.wizard.requirement_title')}</strong>{t('app.chatgpt.wizard.requirement_description')}</p>
        </div>

        <ol className="wizard-steps">
          <li className={addressCopied ? 'wizard-step--complete' : ''}>
            <span>1</span>
            <div>
              <h3>{t('app.chatgpt.wizard.step.copy_address')}</h3>
              <p>{t('app.chatgpt.wizard.copy_address_description')}</p>
              <code>{mcpUrl}</code>
              <button className="wizard-action" onClick={() => void copyAddress()}>
                <Copy size={15} />
                {t('app.chatgpt.wizard.copy_address')}
              </button>
            </div>
          </li>
          <li className={developerModeSettingsOpened ? 'wizard-step--complete' : ''}>
            <span>2</span>
            <div>
              <h3>{t('app.chatgpt.wizard.step.enable_developer_mode')}</h3>
              <div className="wizard-instructions">
                <p>{t('app.chatgpt.wizard.developer_mode_path')}</p>
                <p>{t('app.chatgpt.wizard.developer_mode_missing')}</p>
              </div>
              <button className="wizard-action wizard-action--primary" onClick={() => void openDeveloperModeSettings()}>
                <ExternalLink size={15} /> {t('app.chatgpt.wizard.open_developer_mode')}
              </button>
              <figure className="wizard-guide-figure">
                <img src={enableDeveloperModeGuide} alt={t('app.chatgpt.wizard.developer_mode_image_alt')} />
                <figcaption>{t('app.chatgpt.wizard.developer_mode_caption')}</figcaption>
              </figure>
            </div>
          </li>
          <li className={chatgptOpened ? 'wizard-step--complete' : ''}>
            <span>3</span>
            <div>
              <h3>{t('app.chatgpt.wizard.step.open_plugins')}</h3>
              <p>{t('app.chatgpt.wizard.open_plugins_description')}</p>
              <button className="wizard-action wizard-action--primary" onClick={() => void openChatGPT()}>
                <ExternalLink size={15} /> {t('app.chatgpt.wizard.open_plugins')}
              </button>
              <figure className="wizard-guide-figure">
                <img src={openCreateAppGuide} alt={t('app.chatgpt.wizard.create_button_image_alt')} />
                <figcaption>{t('app.chatgpt.wizard.create_button_caption')}</figcaption>
              </figure>
            </div>
          </li>
          <li className={requestReachedDevSpace ? 'wizard-step--complete' : ''}>
            <span>4</span>
            <div>
              <h3>{t('app.chatgpt.wizard.step.create_app')}</h3>
              <p>{t('app.chatgpt.wizard.create_app_path')}</p>
              <figure className="wizard-guide-figure wizard-guide-figure--portrait">
                <img src={fillCreateAppGuide} alt={t('app.chatgpt.wizard.create_form_image_alt')} />
                <figcaption>{t('app.chatgpt.wizard.create_form_caption')}</figcaption>
              </figure>
              <div className="wizard-url-entry">
                <strong>{t('app.chatgpt.wizard.url_entry_title')}</strong>
                <p>{t('app.chatgpt.wizard.url_entry_description')}</p>
                <div>
                  <code>{mcpUrl}</code>
                  <button className="wizard-action" onClick={() => void copyAddress()}>
                    <Copy size={14} />
                    {t('app.chatgpt.wizard.copy_address')}
                  </button>
                </div>
              </div>
              <dl className="wizard-field-map">
                <div><dt>{t('app.chatgpt.wizard.field.icon')}</dt><dd>{t('app.chatgpt.wizard.field.icon_value')}</dd></div>
                <div><dt>{t('app.chatgpt.wizard.field.name')}</dt><dd><span className="wizard-literal">DevSpace</span></dd></div>
                <div><dt>{t('app.chatgpt.wizard.field.description')}</dt><dd><span className="wizard-literal">{t('app.chatgpt.wizard.field.description_value')}</span></dd></div>
                <div><dt>{t('app.chatgpt.wizard.field.connection')}</dt><dd>{t('app.chatgpt.wizard.field.select')} <span className="wizard-literal">{t('app.chatgpt.wizard.field.connection_value')}</span></dd></div>
                <div><dt>{t('app.chatgpt.wizard.field.url')}</dt><dd>{t('app.chatgpt.wizard.field.url_value')}</dd></div>
                <div><dt>{t('app.chatgpt.wizard.field.auth')}</dt><dd>{t('app.chatgpt.wizard.field.select')} <span className="wizard-literal">OAuth</span></dd></div>
                <div><dt>{t('app.chatgpt.wizard.field.risk')}</dt><dd>{t('app.chatgpt.wizard.field.check')} <span className="wizard-literal">{t('app.chatgpt.wizard.field.risk_value')}</span></dd></div>
              </dl>
              <p>{t('app.chatgpt.wizard.confirm_and_create')}</p>
              <figure className="wizard-guide-figure">
                <img src={confirmAppLoginGuide} alt={t('app.chatgpt.wizard.confirm_login_image_alt')} />
                <figcaption>{t('app.chatgpt.wizard.confirm_login_image_caption')}</figcaption>
              </figure>
            </div>
          </li>
          <li className={authorized ? 'wizard-step--complete' : ''}>
            <span>5</span>
            <div>
              <h3>{t('app.chatgpt.wizard.step.authorize')}</h3>
              <p>{t('app.chatgpt.wizard.authorize_description')}</p>
              <figure className="wizard-guide-figure wizard-guide-figure--portrait">
                <img src={authorizeDevSpaceGuide} alt={t('app.chatgpt.wizard.authorize_image_alt')} />
                <figcaption>{t('app.chatgpt.wizard.authorize_image_caption')}</figcaption>
              </figure>
              <button className="wizard-action" onClick={() => void copyPassword()}>
                {passwordCopied ? <Check size={15} /> : <KeyRound size={15} />}
                {t(passwordCopied ? 'app.chatgpt.wizard.password_copied' : 'app.chatgpt.wizard.copy_owner_password')}
              </button>
              <p className="wizard-security-note">{t('app.chatgpt.wizard.password_security_note')}</p>
            </div>
          </li>
          <li className={connected ? 'wizard-step--complete' : ''}>
            <span>6</span>
            <div>
              <h3>{t('app.chatgpt.wizard.step.verify')}</h3>
              <p>{t('app.chatgpt.wizard.verify_description')}</p>
              <code>{t('app.chatgpt.wizard.verify_prompt')}</code>
              <p>{t(connected ? 'app.chatgpt.wizard.verify_connected' : status.phase === 'configured' ? 'app.chatgpt.wizard.verify_configured' : 'app.chatgpt.wizard.verify_waiting')}</p>
            </div>
          </li>
        </ol>

        <button
          className="primary-button wizard-done"
          disabled={!connected && !canContinue}
          onClick={finishOrContinue}
        >
          {t(connected
            ? 'app.chatgpt.wizard.complete'
            : reconnecting
              ? 'app.chatgpt.wizard.reconnect'
              : canContinue
                ? 'app.chatgpt.wizard.continue_in_chatgpt'
                : status.phase === 'waiting-authorization'
                  ? 'app.chatgpt.wizard.finish_authorization'
                  : 'app.chatgpt.wizard.waiting_complete')}
        </button>
      </section>
    </div>
  )
}
