import {Link, useOutletContext} from 'react-router-dom'
import {EmptyState} from '../features/ui/EmptyState'
import {StatusBadge} from '../features/ui/StatusBadge'
import type {SettingsOutletContext} from './types'
import {memberTeams, teamRoleLabel} from './shared'

export function SettingsProfilePage() {
  const {session, state, teams, canManageTeams} = useOutletContext<SettingsOutletContext>()
  const displayName = session.user.displayName || session.user.username
  const joinedTeams = memberTeams(teams)
  const initial = displayName.slice(0, 1).toUpperCase()

  return (
    <div className="settings-profile-workspace">
      <section className="settings-profile-hero" aria-labelledby="current-account-heading">
        <div className="settings-profile-avatar" aria-hidden="true">{initial}</div>
        <div className="settings-profile-hero-main">
          <strong id="current-account-heading">{displayName}</strong>
          <span>@{session.user.username}</span>
        </div>
        <div className="settings-profile-hero-meta">
          <StatusBadge tone={session.user.systemRole === 'admin' ? 'info' : 'neutral'}>
            {session.user.systemRole === 'admin' ? '系统管理员' : '成员'}
          </StatusBadge>
        </div>
      </section>

      <section className="settings-profile-card" aria-labelledby="joined-teams-heading">
        <header className="settings-profile-card-head">
          <div>
            <strong id="joined-teams-heading">我的团队</strong>
            <span>共享连接与日志会话归属</span>
          </div>
          {canManageTeams && <Link className="settings-text-link" to="/settings/teams">管理团队 →</Link>}
        </header>
        {state === 'loading' ? (
          <div className="workbench-sidebar-state">正在加载团队信息…</div>
        ) : joinedTeams.length === 0 ? (
          <EmptyState title="暂未加入团队" description="请联系团队管理员邀请你，或由系统管理员添加成员。" />
        ) : (
          <ul className="settings-team-list" aria-label="我的团队">
            {joinedTeams.map((team) => (
              <li key={team.id}>
                <div className="settings-team-list-main">
                  <strong>{team.name}</strong>
                  <span>共享连接与日志会话</span>
                </div>
                <StatusBadge tone={team.role === 'admin' ? 'info' : 'neutral'}>{teamRoleLabel(team.role)}</StatusBadge>
              </li>
            ))}
          </ul>
        )}
      </section>

      <footer className="settings-profile-footer">
        <span>快捷入口</span>
        <Link to="/connections">连接中心</Link>
        <Link to="/logs">日志分析</Link>
        {canManageTeams && <Link to="/settings/teams">团队管理</Link>}
      </footer>
    </div>
  )
}
