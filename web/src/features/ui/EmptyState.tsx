import type {ReactNode} from 'react'
import './workbench.css'

export function EmptyState({title, description, action}: {title: string; description?: string; action?: ReactNode}) {
  return (
    <section className="workbench-empty" role="status" aria-label={title}>
      <strong>{title}</strong>
      {description && <p>{description}</p>}
      {action && <div>{action}</div>}
    </section>
  )
}
