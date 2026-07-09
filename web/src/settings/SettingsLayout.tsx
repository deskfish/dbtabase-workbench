import {useState} from 'react'
import {NavLink, Navigate, Outlet} from 'react-router-dom'
import {useAuth} from '../auth/AuthProvider'
import {settingsClient} from './client'
import {manageableTeams} from './shared'
import type {SettingsOutletContext} from './types'
import {useSettingsData} from './useSettingsData'
import '../layout/AppShell.css'

const tabs = [
  {to: '/settings/profile', label: '个人资料', adminOnly: false, teamAdminOnly: false},
  {to: '/settings/teams', label: '团队', adminOnly: false, teamAdminOnly: true},
  {to: '/settings/users', label: '用户', adminOnly: true, teamAdminOnly: false},
]

export function SettingsLayout() {
  const {session} = useAuth()
  const [success, setSuccess] = useState('')
  const data = useSettingsData(session, settingsClient)
  const isSystemAdmin = session?.user.systemRole === 'admin'
  const canManageTeams = isSystemAdmin || manageableTeams(data.teams, false).length > 0

  if (!session) return null

  const outlet: SettingsOutletContext = {
    session,
    client: settingsClient,
    ...data,
    success,
    isSystemAdmin,
    canManageTeams,
    setSuccess,
  }

  return (
    <section className="ops-page">
      <p className="login-kicker">SETTINGS</p>
      <h1>设置</h1>
      <p>管理账号与团队。成员关系在「团队」页维护，「用户」页只管登录账号。</p>
      {success && <p className="form-success" role="status">{success}</p>}
      {data.error && <p className="form-error" role="alert">{data.error}</p>}
      <nav className="settings-tabs" aria-label="设置分区">
        {tabs.map((tab) => {
          if (tab.adminOnly && !isSystemAdmin) return null
          if (tab.teamAdminOnly && !canManageTeams) return null
          return <NavLink key={tab.to} to={tab.to} className={({isActive}) => isActive ? 'active' : undefined}>{tab.label}</NavLink>
        })}
      </nav>
      <Outlet context={outlet} />
    </section>
  )
}

export function SettingsIndexRedirect() {
  return <Navigate to="/settings/profile" replace />
}

export function SettingsUsersGuard() {
  const {session} = useAuth()
  if (session?.user.systemRole !== 'admin') return <Navigate to="/settings/profile" replace />
  return <Outlet />
}

export function SettingsTeamsGuard() {
  const {session} = useAuth()
  const isSystemAdmin = session?.user.systemRole === 'admin'
  const isTeamAdmin = (session?.teams ?? []).some((team) => team.role === 'admin')
  if (!isSystemAdmin && !isTeamAdmin) return <Navigate to="/settings/profile" replace />
  return <Outlet />
}
