import {useState} from 'react'
import {Link, useOutletContext} from 'react-router-dom'
import {Checkbox} from '../features/ui/Checkbox'
import {ConfirmDialog} from '../features/ui/ConfirmDialog'
import {DataGrid} from '../features/ui/DataGrid'
import {EmptyState} from '../features/ui/EmptyState'
import {StatusBadge} from '../features/ui/StatusBadge'
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
      <header className="settings-workspace-head">
        <div><strong id="users-heading">用户</strong><span>登录账号、系统权限与团队归属</span></div>
        <button className="oc-button primary" type="button" onClick={() => setShowCreate(true)}>新建用户</button>
      </header>

      <DataGrid label="用户列表" loading={false} empty={users.length === 0 ? <EmptyState title="暂无用户" description="创建账号后可分配系统角色和团队归属。" /> : undefined}>
            <thead>
              <tr>
                <th>用户名</th>
                <th>显示名</th>
                <th>系统角色</th>
                <th>状态</th>
                <th>所属团队</th>
                <th aria-label="操作" />
              </tr>
            </thead>
            <tbody>
              {users.map((user) => {
                const joined = teamsForUser(user.id, teams, teamMembers)
                const isSelf = user.id === session.user.id
                return (
                  <tr key={user.id} className={user.disabled ? 'settings-row-disabled' : undefined}>
                    <td><code>{user.username}</code></td>
                    <td>{displayUser(user)}</td>
                    <td><StatusBadge tone={user.systemRole === 'admin' ? 'info' : 'neutral'}>{user.systemRole === 'admin' ? '系统管理员' : '成员'}</StatusBadge></td>
                    <td>
                      <Checkbox
                        label={user.disabled ? '已禁用' : '正常'}
                        checked={!user.disabled}
                        disabled={isSelf || togglingDisabled[user.id]}
                        onChange={(event) => { void toggleDisabled(user, !event.target.checked) }}
                      />
                    </td>
                    <td>
                      {joined.length === 0 ? (
                        <span className="settings-muted">未加入团队</span>
                      ) : (
                        <div className="settings-tag-list">
                          {joined.map((team) => (
                            <Link key={team.teamId} className="settings-tag" to={`/settings/teams#team-${team.teamId}`}>
                              {team.name}
                            </Link>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="settings-table-actions">
                      <button className="oc-button" type="button" onClick={() => openEdit(user)}>编辑</button>
                      {!isSelf && (
                        <button
                          className="oc-button danger"
                          type="button"
                          disabled={deletePending && deletingUser?.id === user.id}
                          onClick={() => setDeletingUser(user)}
                        >
                          删除
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
      </DataGrid>

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
