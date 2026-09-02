import { useEffect, useMemo, useState, type JSX } from 'react'
import { Activity, Bot, CheckCircle2, ChevronRight, CircleEllipsis, FolderPlus, Languages, LayoutDashboard, Link2, Power, Server, Wrench } from 'lucide-react'
import { StatusCard } from './components/StatusCard'
import { ProjectList } from './components/ProjectList'
import { RiskDialog } from './components/RiskDialog'
import { ConnectionPanel } from './components/ConnectionPanel'
import { ChatGPTWizard } from './components/ChatGPTWizard'
import { AdvancedPanel } from './components/AdvancedPanel'
import { TailscaleSetupWizard } from './components/TailscaleSetupWizard'
import { OnboardingGuide } from './components/OnboardingGuide'
import { ActivityPanel } from './components/ActivityPanel'
import { ToolCallPanel } from './components/ToolCallPanel'
import { useDesktopSnapshot } from './hooks/useDesktopSnapshot'
import { resolveLocale, saveLocale, translate, type Locale } from './locales/locales'
import type { ChatGPTPhase, ProjectCandidate, ProjectMutationResult, ServicePhase, TailscaleInstallStatus, TunnelPhase } from '../../shared/contracts'

type Tone = 'positive' | 'quiet' | 'negative' | 'working'
type AppTab = 'overview' | 'activity' | 'tools'

const projectErrorKey: Record<Exclude<ProjectMutationResult, { ok: true }>['errorCode'], string> = {
  candidate_expired: 'app.project.candidate_expired',
  high_risk_confirmation_required: 'app.project.risk_description',
  project_unavailable: 'app.project.unavailable',
  project_save_failed: 'app.project.save_failed'
}

const coreStatusKey: Record<ServicePhase, string> = {
  stopped: 'app.service.stopped',
  starting: 'app.service.starting',
  running: 'app.service.running',
  stopping: 'app.service.stopping',
  failed: 'app.service.error'
}

const coreTone: Record<ServicePhase, Tone> = {
  stopped: 'quiet',
  starting: 'working',
  running: 'positive',
  stopping: 'working',
  failed: 'negative'
}

const tunnelStatusKey: Record<TunnelPhase, string> = {
  checking: 'app.tailscale.status.checking',
  'cli-missing': 'app.tailscale.status.not_installed',
  'daemon-unavailable': 'app.tailscale.status.daemon_not_running',
  'not-logged-in': 'app.tailscale.status.not_logged_in',
  offline: 'app.tailscale.status.offline',
  ready: 'app.tailscale.status.online_not_enabled',
  starting: 'app.tailscale.status.enabling',
  connected: 'app.tailscale.status.connected',
  stopping: 'app.tailscale.status.checking',
  failed: 'app.tailscale.status.failed'
}

const tunnelTone: Record<TunnelPhase, Tone> = {
  checking: 'working',
  'cli-missing': 'negative',
  'daemon-unavailable': 'negative',
  'not-logged-in': 'negative',
  offline: 'negative',
  ready: 'quiet',
  starting: 'working',
  connected: 'positive',
  stopping: 'working',
  failed: 'negative'
}

const chatgptStatusKey: Record<ChatGPTPhase, string> = {
  'not-connected': 'app.chatgpt.not_connected',
  'waiting-request': 'app.chatgpt.wizard.status.waiting_for_request',
  'waiting-authorization': 'app.chatgpt.wizard.status.waiting_for_authorization',
  configured: 'app.chatgpt.configured',
  connected: 'app.chatgpt.connected',
  stale: 'app.chatgpt.wizard.status.expired'
}

const chatgptTone: Record<ChatGPTPhase, Tone> = {
  'not-connected': 'quiet',
  'waiting-request': 'working',
  'waiting-authorization': 'working',
  configured: 'positive',
  connected: 'positive',
  stale: 'negative'
}

export function App(): JSX.Element {
  const [locale, setLocale] = useState<Locale>(() => resolveLocale({ storage: localStorage }))
  const [activeTab, setActiveTab] = useState<AppTab>('overview')
  const [projectCandidate, setProjectCandidate] = useState<ProjectCandidate | null>(null)
  const [projectBusy, setProjectBusy] = useState(false)
  const [projectError, setProjectError] = useState<string | null>(null)
  const [tunnelPending, setTunnelPending] = useState(false)
  const [addressCopied, setAddressCopied] = useState(false)
  const [chatgptWizardOpen, setChatgptWizardOpen] = useState(false)
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [tailscaleSetupOpen, setTailscaleSetupOpen] = useState(false)
  const [tailscaleSetupPrompted, setTailscaleSetupPrompted] = useState(false)
  const [tailscaleDetecting, setTailscaleDetecting] = useState(false)
  const [tailscaleInstall, setTailscaleInstall] = useState<TailscaleInstallStatus>({
    phase: 'idle',
    downloadedBytes: 0,
    totalBytes: null,
    errorCode: null
  })
  const { snapshot, pending, startCore, stopCore } = useDesktopSnapshot()
  const t = useMemo(() => (key: string, ...values: Array<string | number>) => translate(key, locale, ...values), [locale])
  const coreRunning = snapshot.core.phase === 'running'
  const chatgptReady = coreRunning && snapshot.tunnel.phase === 'connected' && Boolean(snapshot.tunnel.mcpUrl)
  const fullyReady = chatgptReady && ['configured', 'connected'].includes(snapshot.chatgpt.phase)
  const activityWorking = snapshot.activities.some((item) => item.state === 'working')
  const toolCallsWorking = snapshot.toolCalls.some((item) => item.state === 'working')

  useEffect(() => window.devspace.subscribeTailscaleInstall(setTailscaleInstall), [])

  useEffect(() => {
    if (snapshot.tunnel.phase === 'cli-missing' && !tailscaleSetupPrompted) {
      setTailscaleSetupPrompted(true)
      setTailscaleSetupOpen(true)
    }
  }, [snapshot.tunnel.phase, tailscaleSetupPrompted])

  useEffect(() => {
    if (!tailscaleSetupOpen) return undefined
    const shouldPoll = tailscaleInstall.phase === 'installer-opened' || ['daemon-unavailable', 'not-logged-in', 'offline'].includes(snapshot.tunnel.phase)
    if (!shouldPoll) return undefined
    const timer = window.setInterval(() => { void window.devspace.detectTunnel() }, 2_500)
    return () => window.clearInterval(timer)
  }, [snapshot.tunnel.phase, tailscaleInstall.phase, tailscaleSetupOpen])

  const changeLocale = (next: Locale): void => {
    saveLocale(next)
    document.documentElement.lang = next === 'zh-Hans' ? 'zh-CN' : 'en'
    setLocale(next)
    void window.devspace.setLocale(next)
  }

  const handleMutationResult = (result: ProjectMutationResult): boolean => {
    if (result.ok) {
      setProjectError(null)
      return true
    }
    setProjectError(projectErrorKey[result.errorCode])
    return false
  }

  const authorizeCandidate = async (candidate: ProjectCandidate, confirmHighRisk: boolean): Promise<void> => {
    setProjectBusy(true)
    try {
      const result = await window.devspace.authorizeProject(candidate.token, confirmHighRisk)
      if (handleMutationResult(result)) setProjectCandidate(null)
    } finally {
      setProjectBusy(false)
    }
  }

  const chooseProject = async (): Promise<void> => {
    setProjectBusy(true)
    setProjectError(null)
    try {
      const candidate = await window.devspace.selectProject()
      if (!candidate) return
      if (candidate.highRisk) setProjectCandidate(candidate)
      else await authorizeCandidate(candidate, false)
    } finally {
      setProjectBusy(false)
    }
  }

  const removeProject = async (id: string): Promise<void> => {
    setProjectBusy(true)
    try {
      handleMutationResult(await window.devspace.removeProject(id))
    } finally {
      setProjectBusy(false)
    }
  }

  const runTunnel = async (operation: () => Promise<unknown>): Promise<void> => {
    setTunnelPending(true)
    setAddressCopied(false)
    try {
      await operation()
    } finally {
      setTunnelPending(false)
    }
  }

  const copyMcpUrl = async (): Promise<void> => {
    if (await window.devspace.copyMcpUrl()) {
      setAddressCopied(true)
      window.setTimeout(() => setAddressCopied(false), 2_000)
    }
  }

  const openChatGPTWizard = async (): Promise<void> => {
    if (!chatgptReady) return
    await window.devspace.beginChatGPTSetup()
    setChatgptWizardOpen(true)
  }

  const openChatGPTOrSetup = async (): Promise<void> => {
    if (snapshot.chatgpt.phase === 'configured' || snapshot.chatgpt.phase === 'connected') {
      await window.devspace.openChatGPT()
      return
    }
    await openChatGPTWizard()
  }

  const installTailscale = async (): Promise<void> => {
    setTailscaleInstall(await window.devspace.installTailscale())
  }

  const openTailscaleApp = async (): Promise<void> => {
    await window.devspace.openTailscaleApp()
  }

  const detectTailscale = async (): Promise<void> => {
    setTailscaleDetecting(true)
    try {
      await window.devspace.detectTunnel()
    } finally {
      setTailscaleDetecting(false)
    }
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand" aria-label={t('app.name')}>
          <span className="brand__mark"><span /></span>
          <span>{t('app.name')}</span>
        </div>
        <nav className="primary-tabs" aria-label={t('app.tabs.label')}>
          <button className={activeTab === 'overview' ? 'active' : ''} onClick={() => setActiveTab('overview')} aria-current={activeTab === 'overview' ? 'page' : undefined}>
            <LayoutDashboard size={15} />
            {t('app.tabs.overview')}
          </button>
          <button className={activeTab === 'activity' ? 'active' : ''} onClick={() => setActiveTab('activity')} aria-current={activeTab === 'activity' ? 'page' : undefined}>
            <Activity size={15} />
            {t('app.tabs.activity')}
            {snapshot.activities.length > 0 && <span className={`tab-badge ${activityWorking ? 'tab-badge--working' : ''}`}>{Math.min(snapshot.activities.length, 99)}</span>}
          </button>
          <button className={activeTab === 'tools' ? 'active' : ''} onClick={() => setActiveTab('tools')} aria-current={activeTab === 'tools' ? 'page' : undefined}>
            <Wrench size={15} />
            {t('app.tabs.tool_calls')}
            {snapshot.toolCalls.length > 0 && <span className={`tab-badge ${toolCallsWorking ? 'tab-badge--working' : ''}`}>{Math.min(snapshot.toolCalls.length, 99)}</span>}
          </button>
        </nav>
        <div className="language-switch" aria-label={t('app.settings.language')}>
          <Languages size={15} />
          <button className={locale === 'zh-Hans' ? 'active' : ''} onClick={() => changeLocale('zh-Hans')}>{t('app.settings.language.chinese_short')}</button>
          <span>/</span>
          <button className={locale === 'en' ? 'active' : ''} onClick={() => changeLocale('en')}>{t('app.settings.language.english_short')}</button>
        </div>
      </header>

      <main className={`app-main app-main--${activeTab}`}>
        {activeTab === 'overview' && <>
          <section className="hero">
          <div>
            <p className="eyebrow">{t('app.status.title')}</p>
            <h1>{t('app.home.title')}</h1>
            <p className="hero__copy">{t('app.home.subtitle')}</p>
          </div>
          <div className="hero__actions">
            {fullyReady && (
              <div className="ready-badge" role="status">
                <CheckCircle2 size={18} />
                <div>
                  <strong>{t('app.ready.title')}</strong>
                  <span>{t(snapshot.chatgpt.phase === 'connected' ? 'app.ready.connected_description' : 'app.ready.configured_description')}</span>
                </div>
              </div>
            )}
            <button
              className={`service-control ${coreRunning ? 'service-control--stop' : ''}`}
              disabled={pending || snapshot.core.phase === 'starting' || snapshot.core.phase === 'stopping'}
              onClick={() => void (coreRunning ? stopCore() : startCore())}
            >
              <Power size={18} />
              {t(coreRunning ? 'app.service.stop' : 'app.service.start')}
            </button>
          </div>
        </section>

        <OnboardingGuide
          coreRunning={coreRunning}
          coreBusy={pending || snapshot.core.phase === 'starting' || snapshot.core.phase === 'stopping'}
          tunnel={snapshot.tunnel}
          tunnelBusy={tunnelPending}
          chatgpt={snapshot.chatgpt}
          t={t}
          onStartCore={() => void startCore()}
          onSetupTailscale={() => setTailscaleSetupOpen(true)}
          onStartTunnel={() => void runTunnel(() => window.devspace.startTunnel())}
          onOpenChatGPT={() => void openChatGPTWizard()}
        />

        <section className="status-grid" aria-label={t('app.status.title')}>
          <StatusCard
            icon={Server}
            title={t('app.status.local_service.title')}
            description={t('app.status.local_service.description')}
            status={t(coreStatusKey[snapshot.core.phase])}
            tone={coreTone[snapshot.core.phase]}
          />
          <StatusCard
            icon={Link2}
            title={t('app.status.tailscale.title')}
            description={t('app.status.tailscale.description')}
            status={t(tunnelStatusKey[snapshot.tunnel.phase])}
            tone={tunnelTone[snapshot.tunnel.phase]}
          />
          <StatusCard
            icon={Bot}
            title={t('app.status.chatgpt.title')}
            description={t('app.status.chatgpt.description')}
            status={t(chatgptStatusKey[snapshot.chatgpt.phase])}
            tone={chatgptTone[snapshot.chatgpt.phase]}
          />
        </section>

          <ConnectionPanel
          status={snapshot.tunnel}
          coreRunning={coreRunning}
          pending={tunnelPending}
          copied={addressCopied}
          t={t}
          onDetect={() => void runTunnel(() => window.devspace.detectTunnel())}
          onStart={() => void runTunnel(() => window.devspace.startTunnel())}
          onStop={() => void runTunnel(() => window.devspace.stopTunnel())}
          onCopy={() => void copyMcpUrl()}
          onSetup={() => setTailscaleSetupOpen(true)}
        />

          <section className="workspace-panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">{t('app.project.security_label')}</p>
              <h2>{t('app.project.title')}</h2>
            </div>
            <button className="secondary-button" disabled={projectBusy} onClick={() => void chooseProject()}>
              <FolderPlus size={17} />
              {t('app.project.add')}
            </button>
          </div>
          {projectError && <div className="inline-error">{t(projectError)}</div>}
          {snapshot.projects.length === 0 ? (
            <div className="empty-state">
              <div className="folder-illustration" aria-hidden="true"><span /><i /></div>
              <div>
                <h3>{t('app.project.empty_title')}</h3>
                <p>{t('app.project.empty_description')}</p>
              </div>
            </div>
          ) : (
            <ProjectList
              projects={snapshot.projects}
              removeLabel={t('app.project.remove')}
              unavailableLabel={t('app.project.unavailable')}
              disabled={projectBusy}
              onRemove={(id) => void removeProject(id)}
            />
          )}
        </section>

          <footer className="action-bar">
          <button className="text-button" onClick={() => setAdvancedOpen(true)}>
            <CircleEllipsis size={17} />
            {t('app.advanced.title')}
          </button>
          <div className="version">v{snapshot.appVersion} · {t('app.footer.local_first')}</div>
          <button className="primary-button" disabled={!chatgptReady} onClick={() => void openChatGPTOrSetup()}>
            {t('app.chatgpt.open')}
            <ChevronRight size={18} />
          </button>
          </footer>
        </>}

        {activeTab === 'activity' && (
          <ActivityPanel
            items={snapshot.activities}
            locale={locale}
            t={t}
            onOpenDetails={() => setAdvancedOpen(true)}
          />
        )}

        {activeTab === 'tools' && (
          <ToolCallPanel
            items={snapshot.toolCalls}
            locale={locale}
            t={t}
            onExportReport={() => window.devspace.exportActivityReport()}
          />
        )}
      </main>
      {projectCandidate && (
        <RiskDialog
          candidate={projectCandidate}
          title={t('app.project.risk_title')}
          description={t('app.project.risk_description')}
          cancelLabel={t('app.common.cancel')}
          confirmLabel={t('app.project.confirm_high_risk')}
          onCancel={() => setProjectCandidate(null)}
          onConfirm={() => void authorizeCandidate(projectCandidate, true)}
        />
      )}
      {chatgptWizardOpen && snapshot.tunnel.mcpUrl && (
        <ChatGPTWizard
          mcpUrl={snapshot.tunnel.mcpUrl}
          status={snapshot.chatgpt}
          t={t}
          onClose={() => setChatgptWizardOpen(false)}
        />
      )}
      {tailscaleSetupOpen && (
        <TailscaleSetupWizard
          tunnel={snapshot.tunnel}
          install={tailscaleInstall}
          detecting={tailscaleDetecting}
          t={t}
          onInstall={() => void installTailscale()}
          onOpenApp={() => void openTailscaleApp()}
          onDetect={() => void detectTailscale()}
          onClose={() => setTailscaleSetupOpen(false)}
        />
      )}
      {advancedOpen && <AdvancedPanel snapshot={snapshot} t={t} onClose={() => setAdvancedOpen(false)} />}
    </div>
  )
}
