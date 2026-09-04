import { Folder, FolderOpen, Trash2 } from 'lucide-react'
import type { JSX } from 'react'
import type { ProjectSummary } from '../../../shared/contracts'

interface ProjectListProps {
  projects: ProjectSummary[]
  openLabel: string
  removeLabel: string
  unavailableLabel: string
  onOpen: (id: string) => void
  onRemove: (id: string) => void
  disabled: boolean
}
export function ProjectList({ projects, openLabel, removeLabel, unavailableLabel, onOpen, onRemove, disabled }: ProjectListProps): JSX.Element {
  return (
    <div className="project-list">
      {projects.map((project) => (
        <article className="project-row" key={project.id}>
          <span className="project-row__icon"><Folder size={19} strokeWidth={1.7} /></span>
          <div className="project-row__identity">
            <div className="project-row__title">
              <h3>{project.name}</h3>
              {!project.available && <span>{unavailableLabel}</span>}
            </div>
            <p title={project.path}>{project.path}</p>
          </div>
          <div className="project-row__actions">
            <button
              className="secondary-button project-row__open"
              disabled={disabled || !project.available}
              onClick={() => onOpen(project.id)}
            >
              <FolderOpen size={16} />
              {openLabel}
            </button>
            <button
              className="icon-button"
              aria-label={`${removeLabel}: ${project.name}`}
              title={removeLabel}
              disabled={disabled}
              onClick={() => onRemove(project.id)}
            >
              <Trash2 size={17} />
            </button>
          </div>
        </article>
      ))}
    </div>
  )
}
