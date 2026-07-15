import {useEffect, useMemo, useState} from 'react'
import {useOutletContext} from 'react-router-dom'
import {ConfirmDialog} from '../features/ui/ConfirmDialog'
import {EmptyState} from '../features/ui/EmptyState'
import {TerminalCommandFilter, TerminalInlineAction, TerminalStatus} from '../features/ui/TerminalPrimitives'
import {useUnifiedContext, useUnifiedSidebar} from '../layout/UnifiedShellContext'
import {CreateUserDialog} from './CreateUserDialog'
import {EditUserDialog} from './EditUserDialog'
import {settingsErrorMessage} from './errors'
import {displayUser, teamsForUser} from './shared'
import type {CreateUserInput, SettingsClient, UpdateUserInput, UserSummary} from './client'
import type {TeamMembershipDraft} from './UserTeamAssignmentsField'
import type {SettingsOutletContext} from './types'

export function SettingsUsersPage({client: clientOverride}: {client?: SettingsClient}) {
  const ctx = useOutletContext<SettingsOutletContext>()
  const client = clientOverride ?? ctx.client
  const {users, teams, teamMembers, session, setUsers, setError, setSuccess, refreshAllMembers} = ctx

  const [showCreate, setShowCreate] = useState(false)
  const [creating, setCreating] = useState(false)

  const [editingUser, setEditingUser] = useState<UserSummary | null>(null)
  const [savingEdit, setSavingEdit] = useState(false)
  const [togglingDisabled, setTogglingDisabled] = useState<Record<string, boolean>>({})
  const [deletingUser, setDeletingUser] = useState<UserSummary | null>(null)
  const [deletePending, setDeletePending] = useState(false)
  const [query, setQuery] = useState('')
  const [selectedUserId, setSelectedUserId] = useState('')

  const visibleUsers = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return users
    return users.filter((user) => [user.username, user.displayName, user.systemRole].some((value) => String(value ?? '').toLowerCase().includes(needle)))
  }, [query, users])
  const selectedUser = visibleUsers.find((user) => user.id === selectedUserId) ?? visibleUsers[0] ?? null
  const selectedTeams = useMemo(() => selectedUser ? teamsForUser(selectedUser.id, teams, teamMembers) : [], [selectedUser, teamMembers, teams])

  useEffect(() => {
    if (!selectedUserId && visibleUsers[0]) setSelectedUserId(visibleUsers[0].id)
    else if (selectedUserId && !visibleUsers.some((user) => user.id === selectedUserId)) setSelectedUserId(visibleUsers[0]?.id ?? '')
  }, [selectedUserId, visibleUsers])

  const identityRail = (
    <div className="settings-identity-rail">
      <span className="settings-rail-kicker">IDENTITY & ACCESS</span>
      <nav aria-label="身份区域"><button type="button" aria-current="page">USERS</button><button type="button">TEAMS</button><button type="button">SYSTEM ROLES</button><button type="button">AUDIT TRAIL</button></nav>
      <div className="settings-rail-summary"><span>POLICY SUMMARY</span><TerminalStatus tone="success">{users.filter((user) => !user.disabled).length} active users</TerminalStatus><TerminalStatus tone="info">{users.filter((user) => user.systemRole === 'admin').length} system admins</TerminalStatus><TerminalStatus>{users.filter((user) => user.disabled).length} disabled</TerminalStatus></div>
    </div>
  )
  useUnifiedSidebar(identityRail, {label: '身份与权限', deps: [users]})

  const identityContext = selectedUser ? (
    <div className="settings-identity-context">
      <span className="settings-context-kicker">SELECTED IDENTITY</span>
      <h3>{selectedUser.username}</h3>
      <TerminalStatus tone={selectedUser.disabled ? 'warning' : 'info'}>{selectedUser.systemRole === 'admin' ? 'SYSTEM ADMIN' : 'MEMBER'} · {selectedUser.disabled ? 'DISABLED' : 'ACTIVE'}</TerminalStatus>
      <dl><div><dt>DISPLAY NAME</dt><dd>{displayUser(selectedUser)}</dd></div><div><dt>TEAM</dt><dd>{selectedTeams.map((team) => team.name).join(', ') || '未加入团队'}</dd></div><div><dt>AUTH PROVIDER</dt><dd>local password</dd></div></dl>
      <div className="settings-context-actions"><TerminalInlineAction tone="info" onClick={() => openEdit(selectedUser)}>编辑</TerminalInlineAction>{selectedUser.id !== session.user.id && <><TerminalInlineAction tone={selectedUser.disabled ? 'success' : 'warning'} disabled={togglingDisabled[selectedUser.id]} onClick={() => { void toggleDisabled(selectedUser, !selectedUser.disabled) }}>{selectedUser.disabled ? '启用' : '禁用'}</TerminalInlineAction><TerminalInlineAction tone="danger" disabled={deletePending && deletingUser?.id === selectedUser.id} onClick={() => setDeletingUser(selectedUser)}>删除</TerminalInlineAction></>}</div>
      {selectedUser.id === session.user.id && <p className="settings-protected-note">Protected system account<br /><small>当前登录身份不可禁用或删除。</small></p>}
    </div>
  ) : null
  useUnifiedContext(identityContext, {label: '用户详情', deps: [selectedUser?.id, selectedUser?.disabled, selectedTeams.map((team) => team.teamId).join(','), togglingDisabled[selectedUser?.id ?? ''], deletePending]})

  async function submitCreate(profile: CreateUserInput, teamDraft: TeamMembershipDraft[]) {
    setCreating(true)
    setError('')
    setSuccess('')
    try {
      const created = await client.createUser(profile)
      const joinedTeams = teamDraft.filter((item) => item.joined).map((item) => ({teamId: item.teamId, role: item.role}))
      if (joinedTeams.length > 0) {
        await client.setUserTeams(created.id, joinedTeams)
      }
      setUsers((current) => [...current.filter((user) => user.id !== created.id), created].sort((a, b) => a.username.localeCompare(b.username)))
      await refreshAllMembers()
      setShowCreate(false)
      setSuccess(`已创建用户 ${displayUser(created)}`)
    } catch (err) {
      setError(settingsErrorMessage(err))
    } finally {
      setCreating(false)
    }
  }

  function openEdit(user: UserSummary) {
    setEditingUser(user)
  }

  async function submitEdit(input: {
    profile: UpdateUserInput
    teams: TeamMembershipDraft[]
  }) {
    if (!editingUser) return
    setSavingEdit(true)
    setError('')
    setSuccess('')
    try {
      const updated = await client.updateUser(editingUser.id, {
        displayName: input.profile.displayName.trim(),
        systemRole: input.profile.systemRole,
        disabled: input.profile.disabled,
        password: input.profile.password,
      })
      await client.setUserTeams(
        editingUser.id,
        input.teams.filter((item) => item.joined).map((item) => ({teamId: item.teamId, role: item.role})),
      )
      setUsers((current) => current.map((item) => item.id === editingUser.id ? {...item, ...updated} : item))
      await refreshAllMembers()
      setEditingUser(null)
      setSuccess(`已保存 ${displayUser(updated)}`)
    } catch (err) {
      setError(settingsErrorMessage(err))
    } finally {
      setSavingEdit(false)
    }
  }

  async function toggleDisabled(user: UserSummary, disabled: boolean) {
    if (user.id === session.user.id) return
    setTogglingDisabled((current) => ({...current, [user.id]: true}))
    setError('')
    setSuccess('')
    try {
      const updated = await client.updateUser(user.id, {
        displayName: user.displayName || user.username,
        systemRole: user.systemRole,
        disabled,
      })
      setUsers((current) => current.map((item) => item.id === user.id ? {...item, ...updated} : item))
      setSuccess(disabled ? `已禁用 ${displayUser(user)}` : `已启用 ${displayUser(user)}`)
    } catch (err) {
      setError(settingsErrorMessage(err))
    } finally {
      setTogglingDisabled((current) => ({...current, [user.id]: false}))
    }
  }

  async function confirmDeleteUser() {
    if (!deletingUser) return
    setDeletePending(true)
    setError('')
    setSuccess('')
    try {
      await client.deleteUser(deletingUser.id)
      setUsers((current) => current.filter((item) => item.id !== deletingUser.id))
      setSuccess(`已删除用户 ${displayUser(deletingUser)}`)
      setDeletingUser(null)
    } catch (err) {
      setError(settingsErrorMessage(err))
    } finally {
      setDeletePending(false)
    }
  }

  return (
    <section className="settings-management-workspace" aria-labelledby="users-heading">
      <header className="settings-page-toolbar">
        <div>
          <h2 id="users-heading">Users</h2>
          <p>登录账号、系统权限与团队归属</p>
        </div>
        <TerminalInlineAction tone="success" onClick={() => setShowCreate(true)}>新建用户</TerminalInlineAction>
      </header>
      <div className="settings-identity-workspace">
        <TerminalCommandFilter aria-label="筛选用户" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="用户名 / 显示名 / 系统角色" tokens={['状态：全部']} />
        {visibleUsers.length === 0 ? <div className="settings-empty-workspace"><EmptyState title="暂无用户" description="创建账号后可分配系统角色和团队归属。" /></div> : <div className="settings-terminal-table-wrap"><table className="settings-terminal-table settings-identity-table" aria-label="用户列表">
            <thead><tr><th>IDENTITY</th><th>SYSTEM ROLE</th><th>TEAM</th><th>AUTH STATE</th></tr></thead>
            <tbody>{visibleUsers.map((user) => {
                const joined = teamsForUser(user.id, teams, teamMembers)
                return (
                  <tr key={user.id} className={user.disabled ? 'settings-row-disabled' : undefined} aria-selected={selectedUser?.id === user.id} tabIndex={0} onClick={() => setSelectedUserId(user.id)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelectedUserId(user.id) } }}>
                    <th scope="row"><strong>{user.username}</strong><small>{displayUser(user)}</small></th>
                    <td>{user.systemRole === 'admin' ? 'SYSTEM ADMIN' : 'MEMBER'}</td>
                    <td>{joined.map((team) => team.name).join(', ') || '未加入团队'}</td>
                    <td><TerminalStatus tone={user.disabled ? 'warning' : 'success'}>{user.disabled ? 'DISABLED' : 'ACTIVE'}</TerminalStatus></td>
                  </tr>
                )
              })}</tbody></table></div>}
        <div className="settings-matrix-section"><span>PERMISSION MATRIX</span><div className="settings-terminal-table-wrap"><table className="settings-terminal-table settings-permission-matrix" aria-label="权限矩阵"><thead><tr><th>CAPABILITY</th>{visibleUsers.map((user) => <th key={user.id}>{user.username}</th>)}</tr></thead><tbody>{['Manage users', 'Manage teams', 'Manage connections', 'View system logs'].map((capability) => <tr key={capability}><th scope="row">{capability}</th>{visibleUsers.map((user) => <td key={user.id}><TerminalStatus tone={user.systemRole === 'admin' ? 'success' : capability === 'Manage connections' ? 'info' : 'neutral'}>{user.systemRole === 'admin' ? 'ALLOW' : capability === 'Manage connections' ? 'SCOPED' : 'DENY'}</TerminalStatus></td>)}</tr>)}</tbody></table></div></div>
      </div>

      {showCreate && (
        <CreateUserDialog
          key={teams.map((team) => team.id).join(',')}
          teams={teams}
          submitting={creating}
          onCancel={() => setShowCreate(false)}
          onSubmit={submitCreate}
        />
      )}

      {editingUser && (
        <EditUserDialog
          key={editingUser.id}
          user={editingUser}
          teams={teams}
          teamMembers={teamMembers}
          isSelf={editingUser.id === session.user.id}
          submitting={savingEdit}
          onCancel={() => setEditingUser(null)}
          onSubmit={submitEdit}
        />
      )}

      {deletingUser && (
        <ConfirmDialog
          danger
          title={`删除用户 ${displayUser(deletingUser)}？`}
          description="删除后该账号无法登录，现有会话会被撤销，且无法撤销此操作。若该用户是某团队唯一管理员且团队仍有其他成员，操作会被拒绝。"
          confirmLabel="删除用户"
          onCancel={() => setDeletingUser(null)}
          onConfirm={() => { void confirmDeleteUser() }}
        />
      )}
    </section>
  )
}
