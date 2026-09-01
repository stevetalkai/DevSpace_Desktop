import { useMemo, useState, type JSX } from 'react'
import { Bot, ChevronRight, CircleEllipsis, FolderPlus, Languages, Link2, Power, Server } from 'lucide-react'
import { StatusCard } from './components/StatusCard'
import { useDesktopSnapshot } from './hooks/useDesktopSnapshot'
import { resolveLocale, saveLocale, translate, type Locale } from './locales/locales'
import type { ServicePhase } from '../../shared/contracts'

type Tone = 'positive' | 'quiet' | 'negative' | 'working'

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
  const { snapshot, pending, startCore, stopCore } = useDesktopSnapshot()
  const t = useMemo(() => (key: string, ...values: Array<string | number>) => translate(key, locale, ...values), [locale])
  const coreRunning = snapshot.core.phase === 'running'

  const changeLocale = (next: Locale): void => {
    saveLocale(next)
    document.documentElement.lang = next === 'zh-Hans' ? 'zh-CN' : 'en'
    setLocale(next)
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
          <button className={locale === 'zh-Hans' ? 'active' : ''} onClick={() => changeLocale('zh-Hans')}>中</button>
          <span>/</span>
          <button className={locale === 'en' ? 'active' : ''} onClick={() => changeLocale('en')}>EN</button>
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
            <button className="secondary-button" disabled>
              <FolderPlus size={17} />
              {t('app.project.add')}
            </button>
          </div>
          <div className="empty-state">
            <div className="folder-illustration" aria-hidden="true"><span /><i /></div>
            <div>
              <h3>{t('app.project.empty_title')}</h3>
              <p>{t('app.project.empty_description')}</p>
            </div>
          </div>
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
    </div>
  )
}
