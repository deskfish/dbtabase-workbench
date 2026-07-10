import type {ReactNode} from 'react'
import './workbench.css'

export type StatusTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger'

export function StatusBadge({tone = 'neutral', children}: {tone?: StatusTone; children: ReactNode}) {
  return <span className="status-badge" data-tone={tone}>{children}</span>
}
