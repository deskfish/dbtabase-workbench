import { FormEvent, useEffect, useMemo, useState } from 'react'
import { useAuth } from '../auth/AuthProvider'
import { SelectControl } from '../features/ui/SelectControl'
import { settingsClient, type AddMemberInput, type CreateUserInput, type SettingsClient, type TeamSummary, type UserSummary } from '../settings/client'

type LoadState = 'loading' | 'ready' | 'error'

const roleOptions = [
  {value: 'member', label: '成员'},
  {value: 'admin', label: '管理员'},
]

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '请求失败'
}

function toCurrentUserSummary(user: NonNullable<ReturnType<typeof useAuth>['session']>['user']): UserSummary {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    systemRole: user.systemRole,
    disabled: false,
  }
}

export function SettingsPage({client = settingsClient}: {client?: SettingsClient}) {
  const {session} = useAuth()
  const [state, setState] = useState<LoadState>('loading')
  const [users, setUsers] = useState<UserSummary[]>([])
  const [teams, setTeams] = useState<TeamSummary[]>([])
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [creatingUser, setCreatingUser] = useState(false)
  const [creatingTeam, setCreatingTeam] = useState(false)
  const [newUser, setNewUser] = useState<CreateUserInput>({username: '', displayName: '', password: '', systemRole: 'member'})
  const [teamName, setTeamName] = useState('')
  const [memberForms, setMemberForms] = useState<Record<string, AddMemberInput>>({})
  const [memberPending, setMemberPending] = useState<Record<string, boolean>>({})

  const isSystemAdmin = session?.user.systemRole === 'admin'
  const adminTeams = useMemo(() => teams.filter((team) => team.role === 'admin'), [teams])

  useEffect(() => {
    let cancelled = false
    async function load() {
      if (!session) return
      setState('loading')
      setError('')
      try {
        const [loadedUsers, loadedTeams] = await Promise.all([
          client.listUsers(),
          client.listTeams(),
        ])
        if (cancelled) return
        setUsers(loadedUsers.length > 0 ? loadedUsers : [toCurrentUserSummary(session.user)])
        setTeams(loadedTeams)
        setState('ready')
      } catch (err) {
        if (cancelled) return
        setUsers([toCurrentUserSummary(session.user)])
        setTeams(session.teams)
        setState('error')
        setError(errorMessage(err))
      }
    }
    void load()
    return () => { cancelled = true }
  }, [client, session])

  async function submitUser(event: FormEvent) {
    event.preventDefault()
    setCreatingUser(true)
    setError('')
    setSuccess('')
    try {
      const created = await client.createUser({
        ...newUser,
        username: newUser.username.trim(),
        displayName: newUser.displayName.trim(),
      })
      setUsers((current) => [...current.filter((user) => user.id !== created.id), created].sort((a, b) => a.username.localeCompare(b.username)))
      setNewUser({username: '', displayName: '', password: '', systemRole: 'member'})
      setSuccess('用户已创建')
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setCreatingUser(false)
    }
  }

  async function submitTeam(event: FormEvent) {
    event.preventDefault()
    setCreatingTeam(true)
    setError('')
    setSuccess('')
    try {
      const created = await client.createTeam(teamName.trim())
      setTeams((current) => [...current.filter((team) => team.id !== created.id), created].sort((a, b) => a.name.localeCompare(b.name)))
      setTeamName('')
      setSuccess('团队已创建')
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setCreatingTeam(false)
    }
  }

  async function submitMember(team: TeamSummary, event: FormEvent) {
    event.preventDefault()
    const value = memberForms[team.id] ?? {userId: '', role: 'member'}
    setMemberPending((current) => ({...current, [team.id]: true}))
    setError('')
    setSuccess('')
    try {
      await client.addMember(team.id, {userId: value.userId.trim(), role: value.role})
      setMemberForms((current) => ({...current, [team.id]: {userId: '', role: 'member'}}))
      setSuccess(`已更新 ${team.name} 成员`)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setMemberPending((current) => ({...current, [team.id]: false}))
    }
  }

  function updateMemberForm(teamId: string, patch: Partial<AddMemberInput>) {
    setMemberForms((current) => ({...current, [teamId]: {...(current[teamId] ?? {userId: '', role: 'member'}), ...patch}}))
  }

  const displayName = session?.user.displayName || session?.user.username || ''

  return (
    <section className="ops-page">
      <p className="login-kicker">SETTINGS</p>
      <h1>设置</h1>
      <p>管理本地账号、团队和当前登录上下文。权限由后端再次校验，这里只做清晰分流。</p>
      {success && <p className="form-success" role="status">{success}</p>}
      {error && <p className="form-error" role="alert">{error}</p>}

      <div className="settings-grid">
        <section className="ops-panel">
          <h2>当前账号</h2>
          <div className="settings-profile">
            <strong>{displayName}</strong>
            <span>@{session?.user.username}</span>
            <span className="badge">{session?.user.systemRole === 'admin' ? '系统管理员' : '成员'}</span>
          </div>
          {state === 'loading' && <p>正在加载账号与团队信息…</p>}
          {state === 'error' && <p>已显示会话中的基础信息，可稍后刷新重试。</p>}
        </section>

        <section className="ops-panel">
          <h2>团队成员身份</h2>
          {teams.length === 0 ? <p>当前账号暂未加入团队。</p> : (
            <div className="settings-list">
              {teams.map((team) => (
                <article key={team.id} className="settings-row">
                  <div><strong>{team.name}</strong><span>{team.id}</span></div>
                  <span className="badge">{team.role === 'admin' ? '团队管理员' : '成员'}</span>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>

      {isSystemAdmin && (
        <div className="settings-grid">
          <section className="ops-panel">
            <h2>用户</h2>
            <form className="settings-form" onSubmit={submitUser}>
              <label>用户名<input autoComplete="username" value={newUser.username} onChange={(event) => setNewUser((current) => ({...current, username: event.target.value}))} /></label>
              <label>显示名称<input autoComplete="name" value={newUser.displayName} onChange={(event) => setNewUser((current) => ({...current, displayName: event.target.value}))} /></label>
              <label>初始密码<input type="password" autoComplete="new-password" value={newUser.password} onChange={(event) => setNewUser((current) => ({...current, password: event.target.value}))} /></label>
              <div className="field-block">
                <span>系统角色</span>
                <SelectControl ariaLabel="系统角色" value={newUser.systemRole} options={roleOptions} onChange={(value) => setNewUser((current) => ({...current, systemRole: value}))} />
              </div>
              <button className="oc-button primary" type="submit" disabled={creatingUser}>{creatingUser ? '创建中…' : '创建用户'}</button>
            </form>
            <div className="settings-list">
              {users.map((user) => (
                <article key={user.id} className="settings-row">
                  <div><strong>{user.displayName || user.username}</strong><span>{user.username}</span></div>
                  <span className="badge">{user.systemRole === 'admin' ? '系统管理员' : '成员'}</span>
                </article>
              ))}
            </div>
          </section>

          <section className="ops-panel">
            <h2>团队</h2>
            <form className="settings-form" onSubmit={submitTeam}>
              <label>团队名称<input autoComplete="organization" value={teamName} onChange={(event) => setTeamName(event.target.value)} /></label>
              <button className="oc-button primary" type="submit" disabled={creatingTeam}>{creatingTeam ? '创建中…' : '创建团队'}</button>
            </form>
          </section>
        </div>
      )}

      {adminTeams.length > 0 && (
        <section className="ops-panel">
          <h2>团队成员管理</h2>
          <div className="settings-list">
            {adminTeams.map((team) => {
              const form = memberForms[team.id] ?? {userId: '', role: 'member'}
              return (
                <form key={team.id} className="settings-row settings-member-form" aria-label={`添加成员 - ${team.name}`} onSubmit={(event) => submitMember(team, event)}>
                  <div>
                    <strong>{team.name}</strong>
                    <label>{team.name} 成员用户 ID<input value={form.userId} onChange={(event) => updateMemberForm(team.id, {userId: event.target.value})} /></label>
                  </div>
                  <div className="settings-member-actions">
                    <SelectControl ariaLabel={`${team.name} 成员角色`} value={form.role} options={roleOptions} onChange={(role) => updateMemberForm(team.id, {role})} />
                    <button className="oc-button" type="submit" disabled={memberPending[team.id]}>{memberPending[team.id] ? '添加中…' : `添加 ${team.name} 成员`}</button>
                  </div>
                </form>
              )
            })}
          </div>
        </section>
      )}
    </section>
  )
}
