import { useState, type JSX } from 'react'
import { Bot, Check, Copy, ExternalLink, KeyRound, X } from 'lucide-react'
import type { ChatGPTStatus } from '../../../shared/contracts'

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
  connected: 'app.chatgpt.wizard.status.connected',
  stale: 'app.chatgpt.wizard.status.expired'
}

export function ChatGPTWizard({ mcpUrl, status, t, onClose }: ChatGPTWizardProps): JSX.Element {
  const [addressCopied, setAddressCopied] = useState(false)
  const [passwordCopied, setPasswordCopied] = useState(false)

  const copyAddress = async (): Promise<void> => {
    if (await window.devspace.copyMcpUrl()) setAddressCopied(true)
  }

  const copyPassword = async (): Promise<void> => {
    if (await window.devspace.copyOwnerPassword()) setPasswordCopied(true)
  }

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

        <ol className="wizard-steps">
          <li>
            <span>1</span>
            <div>
              <h3>{t('app.chatgpt.wizard.step.copy_address')}</h3>
              <code>{mcpUrl}</code>
              <button className="wizard-action" onClick={() => void copyAddress()}>
                {addressCopied ? <Check size={15} /> : <Copy size={15} />}
                {t(addressCopied ? 'app.tailscale.copy_address_done' : 'app.chatgpt.wizard.copy_address')}
              </button>
            </div>
          </li>
          <li>
            <span>2</span>
            <div>
              <h3>{t('app.chatgpt.wizard.step.open_settings')}</h3>
              <button className="wizard-action wizard-action--primary" onClick={() => void window.devspace.openChatGPT()}>
                <ExternalLink size={15} /> {t('app.chatgpt.wizard.open_chatgpt')}
              </button>
            </div>
          </li>
          <li>
            <span>3</span>
            <div>
              <h3>{t('app.chatgpt.wizard.step.authorize')}</h3>
              <p>{t('app.chatgpt.wizard.password_security_note')}</p>
              <button className="wizard-action" onClick={() => void copyPassword()}>
                {passwordCopied ? <Check size={15} /> : <KeyRound size={15} />}
                {t(passwordCopied ? 'app.chatgpt.wizard.password_copied' : 'app.chatgpt.wizard.copy_owner_password')}
              </button>
            </div>
          </li>
        </ol>

        <button className="primary-button wizard-done" onClick={onClose}>{t('app.chatgpt.wizard.complete')}</button>
      </section>
    </div>
  )
}
