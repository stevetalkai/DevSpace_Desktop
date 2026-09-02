import { Bot, Check, Link2, LoaderCircle, Play, ShieldCheck } from 'lucide-react'
import type { JSX } from 'react'
import type { ChatGPTStatus, TunnelStatus } from '../../../shared/contracts'

interface OnboardingGuideProps {
  coreRunning: boolean
  coreBusy: boolean
  tunnel: TunnelStatus
  tunnelBusy: boolean
  chatgpt: ChatGPTStatus
  t: (key: string) => string
  onStartCore: () => void
  onSetupTailscale: () => void
  onStartTunnel: () => void
  onOpenChatGPT: () => void
}

type StepState = 'complete' | 'current' | 'pending'

export function OnboardingGuide(props: OnboardingGuideProps): JSX.Element {
  const tailscaleReady = ['ready', 'starting', 'connected', 'stopping'].includes(props.tunnel.phase)
  const preparationReady = props.coreRunning && tailscaleReady
  const connectionReady = props.tunnel.phase === 'connected'
  const chatgptReady = ['configured', 'connected'].includes(props.chatgpt.phase)
  const complete = preparationReady && connectionReady && chatgptReady

  const steps: Array<{ key: string; icon: typeof Check; state: StepState }> = [
    { key: 'preparation', icon: ShieldCheck, state: preparationReady ? 'complete' : 'current' },
    { key: 'connection', icon: Link2, state: connectionReady ? 'complete' : preparationReady ? 'current' : 'pending' },
    { key: props.chatgpt.phase === 'configured' ? 'chatgpt_configured' : 'chatgpt', icon: Bot, state: chatgptReady ? 'complete' : connectionReady ? 'current' : 'pending' }
  ]

  const action = nextAction(props, { preparationReady, connectionReady })
  const ActionIcon = action.icon

  return (
    <section className={`onboarding-guide ${complete ? 'onboarding-guide--complete' : ''}`} aria-labelledby="onboarding-guide-title">
      <div className="onboarding-guide__header">
        <div>
          <p className="eyebrow">{props.t('app.onboarding.label')}</p>
          <h2 id="onboarding-guide-title">{props.t(complete ? 'app.onboarding.complete_title' : `app.onboarding.next.${action.key}.title`)}</h2>
          <p>{props.t(complete ? 'app.onboarding.complete_description' : `app.onboarding.next.${action.key}.description`)}</p>
        </div>
        {!complete && (
          <button className="primary-button onboarding-guide__action" disabled={action.disabled} onClick={action.run}>
            {action.busy ? <LoaderCircle className="spin" size={17} /> : <ActionIcon size={17} />}
            {props.t(action.busy ? 'app.onboarding.working' : `app.onboarding.next.${action.key}.action`)}
          </button>
        )}
      </div>

      <ol className="onboarding-steps" aria-label={props.t('app.onboarding.steps_label')}>
        {steps.map((step, index) => {
          const Icon = step.icon
          return (
            <li key={step.key} className={`onboarding-step onboarding-step--${step.state}`} aria-current={step.state === 'current' ? 'step' : undefined}>
              <span>{step.state === 'complete' ? <Check size={14} /> : <Icon size={14} />}</span>
              <div><small>{props.t('app.onboarding.step_number').replace('%ld', String(index + 1))}</small><strong>{props.t(`app.onboarding.step.${step.key}`)}</strong></div>
            </li>
          )
        })}
      </ol>
    </section>
  )
}

function nextAction(
  props: OnboardingGuideProps,
  state: { preparationReady: boolean; connectionReady: boolean }
): { key: string; icon: typeof Check; run: () => void; disabled: boolean; busy: boolean } {
  if (!props.coreRunning) {
    return { key: 'service', icon: Play, run: props.onStartCore, disabled: props.coreBusy, busy: props.coreBusy }
  }
  if (!state.preparationReady) {
    const checking = props.tunnel.phase === 'checking'
    return { key: 'tailscale', icon: ShieldCheck, run: props.onSetupTailscale, disabled: checking, busy: checking }
  }
  if (!state.connectionReady) {
    return { key: 'connection', icon: Link2, run: props.onStartTunnel, disabled: props.tunnelBusy, busy: props.tunnelBusy }
  }
  return { key: 'chatgpt', icon: Bot, run: props.onOpenChatGPT, disabled: false, busy: false }
}
