import {useState} from 'react'
import {NavLink, Navigate, Outlet, useLocation, useOutletContext} from 'react-router-dom'
import {useAuth} from '../auth/AuthProvider'
import {WorkbenchContent, WorkbenchFrame, WorkbenchSidebar, WorkbenchToolbar} from '../features/ui/WorkbenchFrame'
import {settingsClient, type SettingsClient} from './client'
import {manageableTeams} from './shared'
import type {SettingsOutletContext} from './types'
import {useSettingsData} from './useSettingsData'
import '../layout/AppShell.css'
import './SettingsLayout.css'

const tabs = [
  {to: '/settings/profile', label: '个人资料', adminOnly: false, teamAdminOnly: false},
  {to: '/settings/teams', label: '团队', adminOnly: false, teamAdminOnly: true},
  {to: '/settings/users', label: '用户', adminOnly: true, teamAdminOnly: false},
]

export function SettingsLayout({client = settingsClient}: {client?: SettingsClient}) {
  const {session} = useAuth()
  const [success, setSuccess] = useState('')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const location = useLocation()
  const data = useSettingsData(session, client)
  const isSystemAdmin = session?.user.systemRole === 'admin'
  const canManageTeams = isSystemAdmin || manageableTeams(data.teams, false).length > 0

  if (!session) return null

  const outlet: SettingsOutletContext = {
    session,
    client,
    ...data,
    success,
    isSystemAdmin,
    canManageTeams,
    setSuccess,
  }

  const currentTab = tabs.find((tab) => location.pathname.startsWith(tab.to))?.label ?? '个人资料'

  return (
    <section className="ops-workbench-page settings-workbench-page">
      <WorkbenchFrame sidebarOpen={sidebarOpen} onSidebarOpenChange={setSidebarOpen}>
        <WorkbenchToolbar title="设置" subtitle={currentTab} onOpenSidebar={() => setSidebarOpen(true)} />
        <WorkbenchSidebar label="设置分区">
          <nav className="settings-workbench-nav" aria-label="设置导航">
            {tabs.map((tab) => {
              if (tab.adminOnly && !isSystemAdmin) return null
              if (tab.teamAdminOnly && !canManageTeams) return null
              return <NavLink key={tab.to} to={tab.to} onClick={() => setSidebarOpen(false)}>{tab.label}<span aria-hidden="true">{tab.label === '个人资料' ? '账号与归属' : tab.label === '团队' ? '成员与资源' : '登录与权限'}</span></NavLink>
            })}
          </nav>
        </WorkbenchSidebar>
        <WorkbenchContent label="设置工作区">
          {(success || data.error) && <div className="settings-feedback">{success && <p className="form-success" role="status">{success}</p>}{data.error && <p className="form-error" role="alert">{data.error}</p>}</div>}
          <Outlet context={outlet} />
        </WorkbenchContent>
      </WorkbenchFrame>
    </section>
  )
}

export function SettingsIndexRedirect() {
  return <Navigate to="/settings/profile" replace />
}

export function SettingsUsersGuard() {
  const {session} = useAuth()
  const ctx = useOutletContext<SettingsOutletContext>()
  if (session?.user.systemRole !== 'admin') return <Navigate to="/settings/profile" replace />
  return <Outlet context={ctx} />
}

export function SettingsTeamsGuard() {
  const {session} = useAuth()
  const ctx = useOutletContext<SettingsOutletContext>()
  const isSystemAdmin = session?.user.systemRole === 'admin'
  const isTeamAdmin = (session?.teams ?? []).some((team) => team.role === 'admin')
  if (!isSystemAdmin && !isTeamAdmin) return <Navigate to="/settings/profile" replace />
  return <Outlet context={ctx} />
}
