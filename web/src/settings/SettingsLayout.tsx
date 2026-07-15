import {useState} from 'react'
import {Navigate, Outlet, useLocation, useOutletContext} from 'react-router-dom'
import {useAuth} from '../auth/AuthProvider'
import {useUnifiedContext, useUnifiedRuntime, useUnifiedStatus} from '../layout/UnifiedShellContext'
import {settingsClient, type SettingsClient} from './client'
import {manageableTeams} from './shared'
import type {SettingsOutletContext} from './types'
import {useSettingsData} from './useSettingsData'
import '../layout/AppShell.css'
import './SettingsLayout.css'

export function SettingsLayout({client = settingsClient}: {client?: SettingsClient}) {
  const {session} = useAuth()
  const location = useLocation()
  const [success, setSuccess] = useState('')
  const data = useSettingsData(session, client)
  const isSystemAdmin = session?.user.systemRole === 'admin'
  const canManageTeams = isSystemAdmin || manageableTeams(data.teams, false).length > 0
  const section = location.pathname.split('/').pop() || 'profile'
  useUnifiedRuntime({path: ['settings', section], detail: isSystemAdmin ? 'SYSTEM ADMIN' : canManageTeams ? 'TEAM ADMIN' : 'MEMBER'}, [section, isSystemAdmin, canManageTeams])
  useUnifiedStatus(data.error || success || (data.state === 'loading' ? '正在同步权限…' : `READY · ${data.teams.length} TEAMS`), [data.error, success, data.state, data.teams.length])

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

  return (
    <section className="product-workbench-page settings-workbench-page">
      {section === 'profile' && <SettingsProfileContext name={session.user.displayName || session.user.username} role={session.user.systemRole} teamCount={data.teams.length} />}
      <div className="unified-page-frame">
        <div className="unified-page-body settings-page-body">
          {(success || data.error) && <div className="settings-feedback">{success && <p className="form-success" role="status">{success}</p>}{data.error && <p className="form-error" role="alert">{data.error}</p>}</div>}
          <Outlet context={outlet} />
        </div>
      </div>
    </section>
  )
}

function SettingsProfileContext({name, role, teamCount}: {name: string; role: string; teamCount: number}) {
  useUnifiedContext(<div className="settings-terminal-context"><span>IDENTITY</span><h3>{name}</h3><dl><div><dt>系统角色</dt><dd>{role}</dd></div><div><dt>团队</dt><dd>{teamCount}</dd></div><div><dt>当前区域</dt><dd>profile</dd></div></dl></div>, {label: '身份与权限', deps: [name, role, teamCount]})
  return null
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
