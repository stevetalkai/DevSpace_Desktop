import { useState, type JSX } from 'react'
import { AlertTriangle, Check, ChevronDown, ChevronRight, Download, LoaderCircle, Wrench } from 'lucide-react'
import type { ToolCallItem } from '../../../shared/contracts'
import type { Locale } from '../locales/locales'

interface ToolCallPanelProps {
  items: ToolCallItem[]
  locale: Locale
  t: (key: string, ...values: Array<string | number>) => string
  onExportReport: () => Promise<boolean>
}

const readTools = new Set(['open_workspace', 'read', 'show_changes'])
const writeTools = new Set(['write', 'edit', 'apply_patch', 'exec_command', 'write_stdin', 'bash'])
const commandTools = new Set(['exec_command', 'write_stdin', 'bash'])

export function ToolCallPanel({ items, locale, t, onExportReport }: ToolCallPanelProps): JSX.Element {
  const [open, setOpen] = useState(true)
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set())
  const [exporting, setExporting] = useState(false)
  const [exported, setExported] = useState(false)
  const visibleItems = items.slice(-50).reverse()
  const working = visibleItems.filter((item) => item.state === 'working').length
  const timeFormatter = new Intl.DateTimeFormat(locale === 'zh-Hans' ? 'zh-CN' : 'en', {
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
  })

  const toggleItem = (id: string): void => {
    setExpanded((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const exportReport = async (): Promise<void> => {
    setExporting(true)
    setExported(false)
    try {
      if (await onExportReport()) setExported(true)
    } finally {
      setExporting(false)
    }
  }

  return (
    <section className={`tool-call-panel ${open ? 'tool-call-panel--open' : ''}`} aria-labelledby="tool-call-title">
      <header>
        <div className="tool-call-panel__heading">
          <span><Wrench size={18} /></span>
          <div>
            <h2 id="tool-call-title">{t('app.tool_calls.title')}</h2>
            <p>{t('app.tool_calls.description')}</p>
          </div>
        </div>
        <div className={`tool-call-summary ${working > 0 ? 'tool-call-summary--working' : ''}`}>
          <i /> {working > 0 ? t('app.tool_calls.working', working) : t('app.tool_calls.count', visibleItems.length)}
        </div>
        <button className="activity-toggle" onClick={() => setOpen((value) => !value)} aria-expanded={open} aria-label={t(open ? 'app.tool_calls.collapse' : 'app.tool_calls.expand')}>
          {open ? <ChevronDown size={17} /> : <ChevronRight size={17} />}
        </button>
      </header>
      {open && (
        <>
          {visibleItems.length === 0 ? (
            <p className="tool-call-empty">{t('app.tool_calls.empty')}</p>
          ) : (
            <ol className="tool-call-list">
              {visibleItems.map((item) => {
                const isExpanded = expanded.has(item.id)
                return (
                  <li key={item.id} className={`tool-call-item tool-call-item--${item.state}`}>
                    <button className="tool-call-item__summary" onClick={() => toggleItem(item.id)} aria-expanded={isExpanded}>
                      <span className="tool-call-item__chevron">{isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}</span>
                      <span className="tool-call-item__main">
                        <span className="tool-call-item__title">{t('app.tool_calls.item', item.sequence)} <code>{item.tool}</code></span>
                        <span className="tool-call-badges">
                          {readTools.has(item.tool) && <small>{t('app.tool_calls.badge.read')}</small>}
                          {commandTools.has(item.tool) && <small>{t('app.tool_calls.badge.command')}</small>}
                          {writeTools.has(item.tool) && <small>{t('app.tool_calls.badge.modify')}</small>}
                        </span>
                      </span>
                      <span className="tool-call-item__result">
                        {item.state === 'working' ? <LoaderCircle size={13} className="spin" /> : item.state === 'success' ? <Check size={13} /> : <AlertTriangle size={13} />}
                        <span>{item.state === 'working' ? t('app.tool_calls.state.working') : item.state === 'success' ? t('app.tool_calls.state.success') : t('app.tool_calls.state.error')}</span>
                        <time dateTime={item.timestamp}>{formatDuration(item.durationMs)}</time>
                      </span>
                    </button>
                    {isExpanded && <ToolCallDetails item={item} time={timeFormatter.format(new Date(item.timestamp))} t={t} />}
                  </li>
                )
              })}
            </ol>
          )}
          <div className="tool-call-actions">
            <button className="activity-details" disabled={exporting} onClick={() => void exportReport()}>
              <Download size={13} />{t(exported ? 'app.activity.report.exported' : 'app.activity.report.export')}
            </button>
          </div>
        </>
      )}
    </section>
  )
}

function ToolCallDetails({ item, time, t }: { item: ToolCallItem; time: string; t: ToolCallPanelProps['t'] }): JSX.Element {
  const details: Array<[string, string]> = [[t('app.tool_calls.detail.time'), time]]
  if (item.workingDirectory) details.push([t('app.tool_calls.detail.directory'), item.workingDirectory])
  if (item.path) details.push([t('app.tool_calls.detail.path'), item.path])
  if (item.commandPreview) details.push([t('app.tool_calls.detail.command'), item.commandPreview])
  if (item.files?.length) details.push([t('app.tool_calls.detail.files'), item.files.join(', ')])
  if (item.additions !== undefined || item.removals !== undefined) details.push([t('app.tool_calls.detail.changes'), `+${item.additions ?? 0} / -${item.removals ?? 0}`])
  if (item.exitCode !== undefined) details.push([t('app.tool_calls.detail.exit_code'), String(item.exitCode)])
  if (item.error) details.push([t('app.tool_calls.detail.error'), item.error])
  return <dl className="tool-call-details">{details.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
}

function formatDuration(durationMs: number | undefined): string {
  if (durationMs === undefined) return '—'
  if (durationMs < 1000) return `${durationMs} ms`
  return `${(durationMs / 1000).toFixed(1)} s`
}
