import type {ReactNode} from 'react'
import './workbench.css'

export function DataGrid({label, loading, empty, children, className = ''}: {
  label: string
  loading: boolean
  empty?: ReactNode
  children: ReactNode
  className?: string
}) {
  if (loading) return <div className="workbench-state" role="status">正在加载…</div>
  if (empty) return <div className="workbench-state">{empty}</div>
  return <div className="data-grid-wrap"><table className={`data-grid ${className}`.trim()} aria-label={label}>{children}</table></div>
}
