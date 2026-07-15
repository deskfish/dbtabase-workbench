import { Outlet } from 'react-router-dom'
import { UnifiedShell } from './UnifiedShell'
import './unified-shell.css'

export function AppShell() {
  return (
    <UnifiedShell>
      <Outlet />
    </UnifiedShell>
  )
}
