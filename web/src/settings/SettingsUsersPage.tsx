import {FormEvent, useState} from 'react'
import {Link, useOutletContext} from 'react-router-dom'
import {Checkbox} from '../features/ui/Checkbox'
import {FormDialog} from '../features/ui/FormDialog'
import {SelectControl} from '../features/ui/SelectControl'
import {TextField} from '../features/ui/TextField'
import {settingsErrorMessage} from './errors'
import {displayUser, systemRoleOptions, teamsForUser, validateCreateUser} from './shared'
import type {CreateUserInput, SettingsClient, UpdateUserInput, UserSummary} from './client'
import type {SettingsOutletContext} from './types'

export function SettingsUsersPage({client: clientOverride}: {client?: SettingsClient}) {
  const ctx = useOutletContext<SettingsOutletContext>()
  const client = clientOverride ?? ctx.client
  const {users, teams, teamMembers, session, setUsers, setError, setSuccess} = ctx

  const [showCreate, setShowCreate] = useState(false)
  const [creating, setCreating] = useState(false)
  const [newUser, setNewUser] = useState<CreateUserInput>({username: '', displayName: '', password: '', systemRole: 'member'})
  const [createErrors, setCreateErrors] = useState<Record<string, string>>({})

  const [editingUser, setEditingUser] = useState<UserSummary | null>(null)
  const [editDraft, setEditDraft] = useState<UpdateUserInput>({displayName: '', systemRole: 'member'})
  const [savingEdit, setSavingEdit] = useState(false)
  const [togglingDisabled, setTogglingDisabled] = useState<Record<string, boolean>>({})

  async function submitCreate(event: FormEvent) {
    event.preventDefault()
    const validation = validateCreateUser(newUser)
    if (validation) {
      setCreateErrors({form: validation})
      return
    }
    setCreating(true)
    setError('')
    setSuccess('')
    setCreateErrors({})
    try {
      const created = await client.createUser({
        ...newUser,
        username: newUser.username.trim(),
        displayName: newUser.displayName.trim(),
      })
      setUsers((current) => [...current.filter((user) => user.id !== created.id), created].sort((a, b) => a.username.localeCompare(b.username)))
      setNewUser({username: '', displayName: '', password: '', systemRole: 'member'})
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
    setEditDraft({displayName: user.displayName || user.username, systemRole: user.systemRole, disabled: user.disabled})
  }

  async function submitEdit(event: FormEvent) {
    event.preventDefault()
    if (!editingUser) return
    setSavingEdit(true)
    setError('')
    setSuccess('')
    try {
      const updated = await client.updateUser(editingUser.id, {
        displayName: editDraft.displayName.trim(),
        systemRole: editDraft.systemRole,
        disabled: editDraft.disabled,
      })
      setUsers((current) => current.map((item) => item.id === editingUser.id ? {...item, ...updated} : item))
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

  return (
    <section className="ops-panel">
      <div className="settings-section-head">
        <div>
          <h2>用户</h2>
          <p className="settings-muted">管理谁能登录 Ops Console。团队成员关系请在「团队」页维护。</p>
        </div>
        <button className="oc-button primary" type="button" onClick={() => setShowCreate(true)}>新建用户</button>
      </div>

      {users.length === 0 ? (
        <p className="settings-empty">还没有其他用户。创建第一个账号后，可在团队页将其加入团队。</p>
      ) : (
        <div className="settings-table-wrap">
          <table className="settings-table">
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
                    <td><span className="badge">{user.systemRole === 'admin' ? '系统管理员' : '成员'}</span></td>
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
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {showCreate && (
        <FormDialog
          title="新建用户"
          description="创建后可到「团队」页将其加入团队，共享连接与日志会话。"
          submitLabel="创建用户"
          submitting={creating}
          onCancel={() => { setShowCreate(false); setCreateErrors({}) }}
          onSubmit={submitCreate}
        >
          <TextField label="用户名" autoComplete="username" value={newUser.username} error={createErrors.form} onChange={(event) => { setCreateErrors({}); setNewUser((current) => ({...current, username: event.target.value})) }} />
          <TextField label="显示名称" autoComplete="name" value={newUser.displayName} onChange={(event) => setNewUser((current) => ({...current, displayName: event.target.value}))} />
          <TextField label="初始密码" type="password" autoComplete="new-password" value={newUser.password} onChange={(event) => setNewUser((current) => ({...current, password: event.target.value}))} />
          <div className="field-block">
            <span>系统角色</span>
            <SelectControl ariaLabel="系统角色" value={newUser.systemRole} options={systemRoleOptions} onChange={(systemRole) => setNewUser((current) => ({...current, systemRole}))} />
          </div>
        </FormDialog>
      )}

      {editingUser && (
        <FormDialog
          title={`编辑 ${displayUser(editingUser)}`}
          submitLabel="保存"
          submitting={savingEdit}
          onCancel={() => setEditingUser(null)}
          onSubmit={submitEdit}
        >
          <TextField label="显示名称" value={editDraft.displayName} onChange={(event) => setEditDraft((current) => ({...current, displayName: event.target.value}))} />
          <div className="field-block">
            <span>系统角色</span>
            <SelectControl ariaLabel="系统角色" value={editDraft.systemRole} options={systemRoleOptions} onChange={(systemRole) => setEditDraft((current) => ({...current, systemRole}))} />
          </div>
          <Checkbox
            label="禁用账号"
            description="禁用后无法登录，现有会话会被撤销。"
            checked={Boolean(editDraft.disabled)}
            disabled={editingUser.id === session.user.id}
            onChange={(event) => setEditDraft((current) => ({...current, disabled: event.target.checked}))}
          />
        </FormDialog>
      )}
    </section>
  )
}
