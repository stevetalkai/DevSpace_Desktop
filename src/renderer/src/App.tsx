import { useMemo, useState, type JSX } from 'react'
import { Bot, ChevronRight, CircleEllipsis, FolderPlus, Languages, Link2, Power, Server } from 'lucide-react'
import { StatusCard } from './components/StatusCard'
import { ProjectList } from './components/ProjectList'
import { RiskDialog } from './components/RiskDialog'
import { useDesktopSnapshot } from './hooks/useDesktopSnapshot'
import { resolveLocale, saveLocale, translate, type Locale } from './locales/locales'
import type { ProjectCandidate, ProjectMutationResult, ServicePhase } from '../../shared/contracts'

type Tone = 'positive' | 'quiet' | 'negative' | 'working'

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

export function App(): JSX.Element {
  const [locale, setLocale] = useState<Locale>(() => resolveLocale({ storage: localStorage }))
  const [projectCandidate, setProjectCandidate] = useState<ProjectCandidate | null>(null)
  const [projectBusy, setProjectBusy] = useState(false)
  const [projectError, setProjectError] = useState<string | null>(null)
  const { snapshot, pending, startCore, stopCore } = useDesktopSnapshot()
  const t = useMemo(() => (key: string, ...values: Array<string | number>) => translate(key, locale, ...values), [locale])
  const coreRunning = snapshot.core.phase === 'running'

  const changeLocale = (next: Locale): void => {
    saveLocale(next)
    document.documentElement.lang = next === 'zh-Hans' ? 'zh-CN' : 'en'
    setLocale(next)
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

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand" aria-label={t('app.name')}>
          <span className="brand__mark"><span /></span>
          <span>{t('app.name')}</span>
        </div>
        <div className="language-switch" aria-label={t('app.settings.language')}>
          <Languages size={15} />
          <button className={locale === 'zh-Hans' ? 'active' : ''} onClick={() => changeLocale('zh-Hans')}>{t('app.settings.language.chinese_short')}</button>
          <span>/</span>
          <button className={locale === 'en' ? 'active' : ''} onClick={() => changeLocale('en')}>{t('app.settings.language.english_short')}</button>
        </div>
      </header>

      <main>
        <section className="hero">
          <div>
            <p className="eyebrow">{t('app.status.title')}</p>
            <h1>{t('app.home.title')}</h1>
            <p className="hero__copy">{t('app.home.subtitle')}</p>
          </div>
          <button
            className={`service-control ${coreRunning ? 'service-control--stop' : ''}`}
            disabled={pending || snapshot.core.phase === 'starting' || snapshot.core.phase === 'stopping'}
            onClick={() => void (coreRunning ? stopCore() : startCore())}
          >
            <Power size={18} />
            {t(coreRunning ? 'app.service.stop' : 'app.service.start')}
          </button>
        </section>

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
            status={t('app.status.not_configured')}
            tone="quiet"
          />
          <StatusCard
            icon={Bot}
            title={t('app.status.chatgpt.title')}
            description={t('app.status.chatgpt.description')}
            status={t('app.chatgpt.not_connected')}
            tone="quiet"
          />
        </section>

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
          <button className="text-button">
            <CircleEllipsis size={17} />
            {t('app.advanced.title')}
          </button>
          <div className="version">v{snapshot.appVersion} · {t('app.footer.local_first')}</div>
          <button className="primary-button" disabled>
            {t('app.chatgpt.open')}
            <ChevronRight size={18} />
          </button>
        </footer>
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
    </div>
  )
}
