import {FormEvent, useEffect, useState} from 'react'
import {useOutletContext} from 'react-router-dom'
import {ConfirmDialog} from '../features/ui/ConfirmDialog'
import {SelectControl} from '../features/ui/SelectControl'
import {TextField} from '../features/ui/TextField'
import {settingsErrorMessage} from './errors'
import {displayUser, manageableTeams, teamRoleOptions} from './shared'
import type {AddMemberInput, SettingsClient, TeamMemberSummary, TeamSummary} from './client'
import type {SettingsOutletContext} from './types'

type PendingAction =
  | {type: 'delete-team'; team: TeamSummary}
  | {type: 'remove-member'; team: TeamSummary; member: TeamMemberSummary}

export function SettingsTeamsPage({client: clientOverride}: {client?: SettingsClient}) {
  const ctx = useOutletContext<SettingsOutletContext>()
  const client = clientOverride ?? ctx.client
  const {
    users, teams, teamMembers, isSystemAdmin, setTeams, setError, setSuccess, refreshMembers,
  } = ctx

  const [creatingTeam, setCreatingTeam] = useState(false)
  const [teamName, setTeamName] = useState('')
  const [showCreateTeam, setShowCreateTeam] = useState(false)
  const [editingTeamId, setEditingTeamId] = useState('')
  const [teamDrafts, setTeamDrafts] = useState<Record<string, string>>({})
  const [teamPending, setTeamPending] = useState<Record<string, boolean>>({})
  const [memberForms, setMemberForms] = useState<Record<string, AddMemberInput>>({})
  const [memberPending, setMemberPending] = useState<Record<string, boolean>>({})
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null)

  const managedTeams = manageableTeams(teams, isSystemAdmin)

  useEffect(() => {
    const hash = window.location.hash
    if (!hash.startsWith('#team-')) return
    const target = document.querySelector(hash)
    target?.scrollIntoView({behavior: 'smooth', block: 'start'})
  }, [teams])

  async function submitTeam(event: FormEvent) {
    event.preventDefault()
    if (!teamName.trim()) {
      setError('请输入团队名称')
      return
    }
    setCreatingTeam(true)
    setError('')
    setSuccess('')
    try {
      const created = await client.createTeam(teamName.trim())
      const members = await client.listTeamMembers(created.id).catch(() => [])
      setTeams((current) => [...current.filter((team) => team.id !== created.id), created].sort((a, b) => a.name.localeCompare(b.name)))
      ctx.setTeamMembers((current) => ({...current, [created.id]: members}))
      setTeamName('')
      setShowCreateTeam(false)
      setSuccess(`团队 ${created.name} 已创建`)
    } catch (err) {
      setError(settingsErrorMessage(err))
    } finally {
      setCreatingTeam(false)
    }
  }

  async function saveTeamName(team: TeamSummary) {
    const nextName = (teamDrafts[team.id] ?? team.name).trim()
    if (!nextName || nextName === team.name) {
      setEditingTeamId('')
      return
    }
    setTeamPending((current) => ({...current, [team.id]: true}))
    setError('')
    setSuccess('')
    try {
      const updated = await client.updateTeam(team.id, nextName)
      setTeams((current) => current.map((item) => item.id === team.id ? {...item, ...updated} : item).sort((a, b) => a.name.localeCompare(b.name)))
      setEditingTeamId('')
      setSuccess(`团队已重命名为 ${updated.name}`)
    } catch (err) {
      setError(settingsErrorMessage(err))
    } finally {
      setTeamPending((current) => ({...current, [team.id]: false}))
    }
  }

  async function deleteTeam(team: TeamSummary) {
    setTeamPending((current) => ({...current, [team.id]: true}))
    setError('')
    setSuccess('')
    try {
      await client.deleteTeam(team.id)
      setTeams((current) => current.filter((item) => item.id !== team.id))
      ctx.setTeamMembers((current) => {
        const next = {...current}
        delete next[team.id]
        return next
      })
      setSuccess(`团队 ${team.name} 已删除`)
    } catch (err) {
      setError(settingsErrorMessage(err))
    } finally {
      setTeamPending((current) => ({...current, [team.id]: false}))
      setPendingAction(null)
    }
  }

  function addableUserOptions(team: TeamSummary) {
    const existing = new Set((teamMembers[team.id] ?? []).map((member) => member.user.id))
    return users
      .filter((user) => !user.disabled && !existing.has(user.id))
      .map((user) => ({value: user.id, label: displayUser(user)}))
  }

  function memberForm(team: TeamSummary): AddMemberInput {
    const options = addableUserOptions(team)
    const current = memberForms[team.id]
    return {userId: current?.userId || options[0]?.value || '', role: current?.role || 'member'}
  }

  async function submitMember(team: TeamSummary, event: FormEvent) {
    event.preventDefault()
    const value = memberForm(team)
    if (!value.userId) {
      setError('没有可添加的用户')
      return
    }
    setMemberPending((current) => ({...current, [team.id]: true}))
    setError('')
    setSuccess('')
    try {
      await client.addMember(team.id, value)
      await refreshMembers(team.id)
      setMemberForms((current) => ({...current, [team.id]: {userId: '', role: 'member'}}))
      setSuccess(`已添加成员到 ${team.name}`)
    } catch (err) {
      setError(settingsErrorMessage(err))
    } finally {
      setMemberPending((current) => ({...current, [team.id]: false}))
    }
  }

  async function updateExistingMemberRole(team: TeamSummary, member: TeamMemberSummary, role: string) {
    if (member.role === role) return
    setError('')
    setSuccess('')
    try {
      await client.updateMemberRole(team.id, member.user.id, role)
      await refreshMembers(team.id)
      setSuccess(`已更新 ${displayUser(member.user)} 在 ${team.name} 的角色`)
    } catch (err) {
      setError(settingsErrorMessage(err))
    }
  }

  async function removeExistingMember(team: TeamSummary, member: TeamMemberSummary) {
    setError('')
    setSuccess('')
    try {
      await client.removeMember(team.id, member.user.id)
      await refreshMembers(team.id)
      setSuccess(`已从 ${team.name} 移除 ${displayUser(member.user)}`)
    } catch (err) {
      setError(settingsErrorMessage(err))
    } finally {
      setPendingAction(null)
    }
  }

  function renderTeamCard(team: TeamSummary) {
    const members = teamMembers[team.id] ?? []
    const options = addableUserOptions(team)
    const form = memberForm(team)
    const editingName = editingTeamId === team.id
    const canManageMembers = isSystemAdmin || team.role === 'admin'

    return (
      <article key={team.id} id={`team-${team.id}`} className="team-card">
        <header className="team-card-head">
          {editingName ? (
            <form
              className="team-name-form"
              onSubmit={(event) => { event.preventDefault(); void saveTeamName(team) }}
            >
              <TextField
                label={`${team.name} 新名称`}
                value={teamDrafts[team.id] ?? team.name}
                onChange={(event) => setTeamDrafts((current) => ({...current, [team.id]: event.target.value}))}
              />
              <div className="settings-row-actions">
                <button className="oc-button primary" type="submit" disabled={teamPending[team.id]}>{teamPending[team.id] ? '保存中…' : '保存名称'}</button>
                <button className="oc-button" type="button" onClick={() => setEditingTeamId('')}>取消</button>
              </div>
            </form>
          ) : (
            <>
              <div>
                <h3>{team.name}</h3>
                <p className="settings-muted">{members.length} 名成员 · 共享连接与日志会话</p>
              </div>
              <div className="settings-row-actions">
                {canManageMembers && (
                  <button
                    className="oc-button"
                    type="button"
                    onClick={() => { setEditingTeamId(team.id); setTeamDrafts((current) => ({...current, [team.id]: team.name})) }}
                  >
                    重命名
                  </button>
                )}
                {isSystemAdmin && (
                  <button
                    className="oc-button danger"
                    type="button"
                    disabled={teamPending[team.id]}
                    onClick={() => setPendingAction({type: 'delete-team', team})}
                  >
                    删除
                  </button>
                )}
              </div>
            </>
          )}
        </header>

        <div className="team-member-list" role="list" aria-label={`${team.name} 成员`}>
          {members.length === 0 ? (
            <p className="settings-muted">还没有成员。添加第一位成员后即可共享团队连接。</p>
          ) : members.map((member) => (
            <div key={member.user.id} className="team-member-row" role="listitem">
              <div className="team-member-main">
                <strong>{displayUser(member.user)}</strong>
                <span>@{member.user.username}</span>
              </div>
              {canManageMembers ? (
                <div className="team-member-actions">
                  <SelectControl
                    ariaLabel={`${displayUser(member.user)} 在 ${team.name} 的角色`}
                    value={member.role}
                    options={teamRoleOptions}
                    onChange={(role) => { void updateExistingMemberRole(team, member, role) }}
                  />
                  <button
                    className="oc-button danger"
                    type="button"
                    onClick={() => setPendingAction({type: 'remove-member', team, member})}
                  >
                    移除
                  </button>
                </div>
              ) : (
                <span className="badge">{member.role === 'admin' ? '团队管理员' : '成员'}</span>
              )}
            </div>
          ))}
        </div>

        {canManageMembers && (
          <footer className="team-add-member">
            <form className="team-add-member-form" aria-label={`添加成员 - ${team.name}`} onSubmit={(event) => submitMember(team, event)}>
              <SelectControl
                ariaLabel={`${team.name} 选择成员`}
                value={form.userId}
                options={options}
                disabled={options.length === 0}
                onChange={(userId) => setMemberForms((current) => ({...current, [team.id]: {...memberForm(team), userId}}))}
              />
              <SelectControl
                ariaLabel={`${team.name} 成员角色`}
                value={form.role}
                options={teamRoleOptions}
                onChange={(role) => setMemberForms((current) => ({...current, [team.id]: {...memberForm(team), role}}))}
              />
              <button className="oc-button primary" type="submit" disabled={memberPending[team.id] || options.length === 0}>
                {memberPending[team.id] ? '添加中…' : '添加成员'}
              </button>
            </form>
            {options.length === 0 && members.length > 0 && (
              <p className="settings-muted">所有可用用户都已在此团队中。</p>
            )}
          </footer>
        )}
      </article>
    )
  }

  return (
    <>
      <section className="ops-panel">
        <div className="settings-section-head">
          <div>
            <h2>团队</h2>
            <p className="settings-muted">团队决定谁能共享数据库连接与日志会话。成员关系只在这里维护。</p>
          </div>
          {isSystemAdmin && (
            <button className="oc-button primary" type="button" onClick={() => setShowCreateTeam((current) => !current)}>
              {showCreateTeam ? '取消' : '新建团队'}
            </button>
          )}
        </div>

        {isSystemAdmin && showCreateTeam && (
          <form className="settings-inline-create" onSubmit={submitTeam}>
            <TextField label="团队名称" autoComplete="organization" value={teamName} onChange={(event) => setTeamName(event.target.value)} />
            <button className="oc-button primary" type="submit" disabled={creatingTeam}>{creatingTeam ? '创建中…' : '创建团队'}</button>
          </form>
        )}

        {managedTeams.length === 0 ? (
          <p className="settings-empty">
            {isSystemAdmin ? '还没有团队。创建第一个团队，开始共享连接与日志资源。' : '你暂无可管理的团队。'}
          </p>
        ) : (
          <div className="team-card-grid">{managedTeams.map(renderTeamCard)}</div>
        )}
      </section>

      {pendingAction?.type === 'delete-team' && (
        <ConfirmDialog
          danger
          title={`删除团队 ${pendingAction.team.name}？`}
          description="删除团队会级联移除其团队连接与日志会话，且无法撤销。请确认团队内资源已不再需要。"
          confirmLabel="删除团队"
          onCancel={() => setPendingAction(null)}
          onConfirm={() => { void deleteTeam(pendingAction.team) }}
        />
      )}
      {pendingAction?.type === 'remove-member' && (
        <ConfirmDialog
          danger
          title={`从 ${pendingAction.team.name} 移除 ${displayUser(pendingAction.member.user)}？`}
          description="如果该成员是团队最后一名管理员，操作会被拒绝。"
          confirmLabel="移除成员"
          onCancel={() => setPendingAction(null)}
          onConfirm={() => { void removeExistingMember(pendingAction.team, pendingAction.member) }}
        />
      )}
    </>
  )
}
