import { AlertTriangle } from 'lucide-react'
import type { JSX } from 'react'
import type { ProjectCandidate } from '../../../shared/contracts'

interface RiskDialogProps {
  candidate: ProjectCandidate
  title: string
  description: string
  cancelLabel: string
  confirmLabel: string
  onCancel: () => void
  onConfirm: () => void
}

export function RiskDialog(props: RiskDialogProps): JSX.Element {
  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={props.onCancel}>
      <section
        className="risk-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="risk-dialog-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <span className="risk-dialog__icon"><AlertTriangle size={22} /></span>
        <h2 id="risk-dialog-title">{props.title}</h2>
        <p>{props.description}</p>
        <code>{props.candidate.path}</code>
        <div className="risk-dialog__actions">
          <button className="secondary-button" onClick={props.onCancel}>{props.cancelLabel}</button>
          <button className="danger-button" onClick={props.onConfirm}>{props.confirmLabel}</button>
        </div>
      </section>
    </div>
  )
}
