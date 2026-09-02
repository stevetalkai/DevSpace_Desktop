import type { JSX } from 'react'
import { AlertTriangle, Check, CircleEllipsis, Info, LoaderCircle } from 'lucide-react'
import type { ActivityItem, ActivityKind } from '../../../shared/contracts'
import type { Locale } from '../locales/locales'

interface ActivityPanelProps {
  items: ActivityItem[]
  locale: Locale
  t: (key: string, ...values: Array<string | number>) => string
  onOpenDetails: () => void
}

const activityKey: Record<ActivityKind, string> = {
  'core.starting': 'app.activity.core.starting',
  'core.running': 'app.activity.core.running',
  'core.stopping': 'app.activity.core.stopping',
  'core.stopped': 'app.activity.core.stopped',
  'core.failed': 'app.activity.core.failed',
  'tunnel.checking': 'app.activity.tunnel.checking',
  'tunnel.starting': 'app.activity.tunnel.starting',
  'tunnel.connected': 'app.activity.tunnel.connected',
  'tunnel.stopped': 'app.activity.tunnel.stopped',
  'tunnel.failed': 'app.activity.tunnel.failed',
  'chatgpt.waiting_request': 'app.activity.chatgpt.waiting_request',
  'chatgpt.waiting_authorization': 'app.activity.chatgpt.waiting_authorization',
  'chatgpt.configured': 'app.activity.chatgpt.configured',
  'chatgpt.connected': 'app.activity.chatgpt.connected',
  'chatgpt.stale': 'app.activity.chatgpt.stale',
  'chatgpt.disconnected': 'app.activity.chatgpt.disconnected',
  'request.received': 'app.activity.request.received',
  'request.tool_started': 'app.activity.request.tool_started',
  'request.completed': 'app.activity.request.completed',
  'request.failed': 'app.activity.request.failed'
}

const toolKey: Record<string, string> = {
  open_workspace: 'app.activity.tool.open_workspace',
  read: 'app.activity.tool.read',
  write: 'app.activity.tool.write',
  edit: 'app.activity.tool.edit',
  bash: 'app.activity.tool.bash',
  apply_patch: 'app.activity.tool.apply_patch',
  exec_command: 'app.activity.tool.exec_command',
  write_stdin: 'app.activity.tool.write_stdin',
  show_changes: 'app.activity.tool.show_changes'
}

function icon(item: ActivityItem): JSX.Element {
  if (item.state === 'working') return <LoaderCircle size={14} className="spin" />
  if (item.state === 'success') return <Check size={14} />
  if (item.state === 'error') return <AlertTriangle size={14} />
  return <Info size={14} />
}

export function ActivityPanel({ items, locale, t, onOpenDetails }: ActivityPanelProps): JSX.Element {
  const recentItems = items.slice().reverse()
  const latestWorking = recentItems.some((item) => item.state === 'working')
  const timeFormatter = new Intl.DateTimeFormat(locale === 'zh-Hans' ? 'zh-CN' : 'en', {
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
  })

  return (
    <section className="activity-panel activity-panel--page" aria-labelledby="activity-title">
      <header>
        <div className="activity-panel__heading">
          <span><CircleEllipsis size={18} /></span>
          <div>
            <h2 id="activity-title">{t('app.activity.title')}</h2>
            <p>{t('app.activity.description')}</p>
          </div>
        </div>
        <div className={`activity-live ${latestWorking ? 'activity-live--working' : ''}`}>
          <i /> {t(latestWorking ? 'app.activity.working' : 'app.activity.live')}
        </div>
      </header>
      {recentItems.length === 0 ? (
            <p className="activity-empty">{t('app.activity.empty')}</p>
          ) : (
            <ol className="activity-list">
              {recentItems.map((item) => {
                const detail = item.detail ? t(toolKey[item.detail] ?? 'app.activity.tool.other', item.detail) : undefined
                const showDetail = detail && item.kind !== 'request.tool_started'
                return (
                  <li key={item.id} className={`activity-item activity-item--${item.state}`}>
                    <span className="activity-item__icon">{icon(item)}</span>
                    <div>
                      <strong>{t(activityKey[item.kind], detail ?? '')}</strong>
                      {showDetail && <small>{detail}</small>}
                    </div>
                    <time dateTime={item.timestamp}>{timeFormatter.format(new Date(item.timestamp))}</time>
                  </li>
                )
              })}
            </ol>
          )}
      <div className="activity-actions">
        <button className="activity-details" onClick={onOpenDetails}>{t('app.activity.open_details')}</button>
      </div>
    </section>
  )
}
