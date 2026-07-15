import {useContext, type ReactNode} from 'react'
import {UnifiedShellContext, UnifiedShellProvider} from './UnifiedShellContext'

function UnifiedSidebarProbe() {
  const ctx = useContext(UnifiedShellContext)
  if (!ctx?.sidebar?.content) return null
  return (
    <aside className="unified-sidebar-probe" aria-label={ctx.sidebar.label ?? '上下文'}>
      {ctx.sidebar.content}
      {ctx.sidebar.footer}
    </aside>
  )
}

function UnifiedContextProbe() {
  const ctx = useContext(UnifiedShellContext)
  if (!ctx?.contextRail?.content) return null
  return <aside className="unified-context-probe" aria-label={ctx.contextRail.label ?? '上下文'}>{ctx.contextRail.content}{ctx.contextRail.footer}</aside>
}

export function UnifiedShellTestHarness({children}: {children: ReactNode}) {
  return (
    <UnifiedShellProvider>
      <UnifiedSidebarProbe />
      <UnifiedContextProbe />
      {children}
    </UnifiedShellProvider>
  )
}
