import {Link, useOutletContext} from 'react-router-dom'
import {DataGrid} from '../features/ui/DataGrid'
import {EmptyState} from '../features/ui/EmptyState'
import {StatusBadge} from '../features/ui/StatusBadge'
import type {SettingsOutletContext} from './types'
import {memberTeams, teamRoleLabel} from './shared'

export function SettingsProfilePage() {
  const {session, state, teams, canManageTeams} = useOutletContext<SettingsOutletContext>()
  const displayName = session.user.displayName || session.user.username
  const joinedTeams = memberTeams(teams)

  return (
    <div className="settings-profile-workspace">
      <section className="settings-workspace-section" aria-labelledby="current-account-heading">
        <header className="settings-workspace-head"><div><strong id="current-account-heading">当前账号</strong><span>会话身份与系统权限</span></div></header>
        <dl className="settings-definition-grid">
          <div><dt>显示名称</dt><dd>{displayName}</dd></div>
          <div><dt>用户名</dt><dd><code>@{session.user.username}</code></dd></div>
          <div><dt>系统角色</dt><dd><StatusBadge tone={session.user.systemRole === 'admin' ? 'info' : 'neutral'}>{session.user.systemRole === 'admin' ? '系统管理员' : '成员'}</StatusBadge></dd></div>
          <div><dt>数据状态</dt><dd><StatusBadge tone={state === 'error' ? 'warning' : state === 'loading' ? 'info' : 'success'}>{state === 'error' ? '使用会话数据' : state === 'loading' ? '正在同步' : '已同步'}</StatusBadge></dd></div>
        </dl>
      </section>

      <section className="settings-workspace-section" aria-labelledby="joined-teams-heading">
        <header className="settings-workspace-head"><div><strong id="joined-teams-heading">我的团队</strong><span>团队连接与日志会话归属</span></div>{canManageTeams && <Link className="oc-button" to="/settings/teams">管理团队</Link>}</header>
        <DataGrid label="我的团队" loading={state === 'loading'} empty={joinedTeams.length === 0 ? <EmptyState title="暂未加入团队" description="请联系团队管理员邀请你，或由系统管理员添加成员。" /> : undefined}>
          <thead><tr><th>团队</th><th>可用资源</th><th>角色</th></tr></thead>
          <tbody>{joinedTeams.map((team) => <tr key={team.id}><th scope="row">{team.name}</th><td>共享连接与日志会话</td><td><StatusBadge tone={team.role === 'admin' ? 'info' : 'neutral'}>{teamRoleLabel(team.role)}</StatusBadge></td></tr>)}</tbody>
        </DataGrid>
      </section>
    </div>
  )
}
