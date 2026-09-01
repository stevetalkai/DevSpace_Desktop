import type { LucideIcon } from 'lucide-react'
import type { JSX } from 'react'

interface StatusCardProps {
  title: string
  description: string
  status: string
  tone: 'positive' | 'quiet' | 'negative' | 'working'
  icon: LucideIcon
}

export function StatusCard({ title, description, status, tone, icon: Icon }: StatusCardProps): JSX.Element {
  return (
    <article className={`status-card status-card--${tone}`}>
      <div className="status-card__head">
        <span className="status-card__icon"><Icon size={18} strokeWidth={1.8} /></span>
        <span className="status-card__state"><i />{status}</span>
      </div>
      <div>
        <h3>{title}</h3>
        <p>{description}</p>
      </div>
    </article>
  )
}
