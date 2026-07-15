import type {ReactNode} from 'react'
import './workbench.css'

export function WorkbenchFrame({children, sidebarOpen, onSidebarOpenChange, className = ''}: {
  children: ReactNode
  sidebarOpen: boolean
  onSidebarOpenChange(open: boolean): void
  className?: string
}) {
  return (
    <section className={`workbench-frame ${className}`.trim()} data-sidebar-open={sidebarOpen}>
      <button
        className="workbench-sidebar-backdrop"
        aria-label="关闭侧栏"
        type="button"
        onClick={() => onSidebarOpenChange(false)}
      />
      {children}
    </section>
  )
}

export function WorkbenchPaneToolbar({children, onOpenSidebar}: {
  children?: ReactNode
  onOpenSidebar?: () => void
}) {
  return (
    <header className="workbench-pane-toolbar">
      {onOpenSidebar && <button className="workbench-sidebar-trigger" aria-label="打开侧栏" type="button" onClick={onOpenSidebar}>导航</button>}
      {children && <div className="workbench-pane-toolbar-actions">{children}</div>}
    </header>
  )
}

export function WorkbenchSidebar({label, children, footer}: {label: string; children: ReactNode; footer?: ReactNode}) {
  return (
    <aside className="workbench-sidebar" aria-label={label}>
      <div className="workbench-sidebar-body">{children}</div>
      {footer && <footer>{footer}</footer>}
    </aside>
  )
}

export function WorkbenchContent({label = '工作区', children}: {label?: string; children: ReactNode}) {
  return <main className="workbench-content" aria-label={label}>{children}</main>
}
