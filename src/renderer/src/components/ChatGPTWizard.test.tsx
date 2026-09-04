import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { ChatGPTWizard } from './ChatGPTWizard'
import { OnboardingGuide } from './OnboardingGuide'

const t = (key: string, ...values: Array<string | number>): string => `${key}${values.length ? `:${values.join(',')}` : ''}`

describe('ChatGPTWizard', () => {
  it('keeps password recovery and reconnect actions available after an earlier authorization', () => {
    const html = renderToStaticMarkup(
      <ChatGPTWizard
        mcpUrl="https://example.test/mcp"
        status={{ phase: 'configured', lastConnectedAt: null }}
        t={t}
        onClose={() => undefined}
      />
    )

    expect(html).toContain('app.chatgpt.wizard.copy_owner_password')
    expect(html).toContain('app.chatgpt.wizard.reconnect')
    expect(html).toContain('chatgpt-wizard__close')
    expect(html).toContain('chatgpt-wizard__scroll')
  })

  it('puts the password action near the status when ChatGPT is waiting for authorization', () => {
    const html = renderToStaticMarkup(
      <ChatGPTWizard
        mcpUrl="https://example.test/mcp"
        status={{ phase: 'waiting-authorization', lastConnectedAt: null }}
        t={t}
        onClose={() => undefined}
      />
    )

    expect(html).toContain('app.chatgpt.wizard.authorization_requested_title')
    expect(html).toContain('app.chatgpt.wizard.authorization_requested_description')
    expect(html.match(/app\.chatgpt\.wizard\.copy_owner_password/g)).toHaveLength(2)
    expect(html.match(/wizard-action wizard-action--primary/g)).toHaveLength(4)
  })
})

describe('OnboardingGuide', () => {
  it('does not treat a saved authorization as a current ChatGPT connection', () => {
    const html = renderToStaticMarkup(
      <OnboardingGuide
        coreRunning
        coreBusy={false}
        tunnel={{ phase: 'connected', publicUrl: 'https://example.test', mcpUrl: 'https://example.test/mcp', errorCode: null }}
        tunnelBusy={false}
        chatgpt={{ phase: 'configured', lastConnectedAt: null }}
        t={t}
        onStartCore={() => undefined}
        onSetupTailscale={() => undefined}
        onStartTunnel={() => undefined}
        onOpenChatGPT={() => undefined}
      />
    )

    expect(html).toContain('app.onboarding.next.chatgpt.title')
    expect(html).not.toContain('app.onboarding.complete_title')
  })
})
