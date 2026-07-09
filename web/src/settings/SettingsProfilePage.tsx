import {Link, useOutletContext} from 'react-router-dom'
import type {SettingsOutletContext} from './types'
import {memberTeams, teamRoleLabel} from './shared'

export function SettingsProfilePage() {
  const {session, state, teams, canManageTeams} = useOutletContext<SettingsOutletContext>()
  const displayName = session.user.displayName || session.user.username
  const joinedTeams = memberTeams(teams)

  return (
    <div className="settings-grid">
      <section className="ops-panel">
        <h2>当前账号</h2>
        <div className="settings-profile">
          <strong>{displayName}</strong>
          <span>@{session.user.username}</span>
          <span className="badge">{session.user.systemRole === 'admin' ? '系统管理员' : '成员'}</span>
        </div>
        {state === 'loading' && <p className="settings-muted">正在加载账号与团队信息…</p>}
        {state === 'error' && <p className="settings-muted">已显示会话中的基础信息，可稍后刷新重试。</p>}
      </section>

      <section className="ops-panel">
        <div className="settings-section-head">
          <div>
            <h2>我的团队</h2>
            <p className="settings-muted">团队连接可在连接中心查看和使用。</p>
          </div>
          {canManageTeams && <Link className="oc-button" to="/settings/teams">管理团队</Link>}
        </div>
        {joinedTeams.length === 0 ? (
          <p className="settings-empty">你暂未加入任何团队。请联系团队管理员邀请你，或由系统管理员在团队页添加。</p>
        ) : (
          <div className="settings-list">
            {joinedTeams.map((team) => (
              <article key={team.id} className="settings-row">
                <div>
                  <strong>{team.name}</strong>
                  <span className="settings-muted">共享连接与日志会话</span>
                </div>
                <span className="badge">{teamRoleLabel(team.role)}</span>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
