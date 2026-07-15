import {useEffect, useMemo, useState} from 'react'
import {useOutletContext} from 'react-router-dom'
import {ConfirmDialog} from '../features/ui/ConfirmDialog'
import {EmptyState} from '../features/ui/EmptyState'
import {FormDialog} from '../features/ui/FormDialog'
import {TerminalInlineAction, TerminalStatus} from '../features/ui/TerminalPrimitives'
import {TextField} from '../features/ui/TextField'
import {useUnifiedContext, useUnifiedSidebar} from '../layout/UnifiedShellContext'
import {CreateTeamDialog} from './CreateTeamDialog'
import {settingsErrorMessage} from './errors'
import {manageableTeams} from './shared'
import {TeamMembersDialog, type TeamMemberDraft} from './TeamMembersDialog'
import type {SettingsClient, TeamSummary} from './client'
import type {SettingsOutletContext} from './types'

type PendingAction = {type: 'delete-team'; team: TeamSummary}

export function SettingsTeamsPage({client: clientOverride}: {client?: SettingsClient}) {
  const ctx = useOutletContext<SettingsOutletContext>()
  const client = clientOverride ?? ctx.client
  const {
    users, teams, teamMembers, isSystemAdmin, setTeams, setError, setSuccess, refreshMembers,
  } = ctx

  const [creatingTeam, setCreatingTeam] = useState(false)
  const [showCreateTeam, setShowCreateTeam] = useState(false)
  const [editingTeamId, setEditingTeamId] = useState('')
  const [teamDrafts, setTeamDrafts] = useState<Record<string, string>>({})
  const [teamPending, setTeamPending] = useState<Record<string, boolean>>({})
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null)
  const [managingTeam, setManagingTeam] = useState<TeamSummary | null>(null)
  const [savingMembers, setSavingMembers] = useState(false)
  const [selectedTeamId, setSelectedTeamId] = useState('')

  const managedTeams = useMemo(() => manageableTeams(teams, isSystemAdmin), [teams, isSystemAdmin])
  const selectedTeam = managedTeams.find((team) => team.id === selectedTeamId) ?? managedTeams[0] ?? null
  const selectedMembers = useMemo(() => selectedTeam ? teamMembers[selectedTeam.id] ?? [] : [], [selectedTeam, teamMembers])

  useEffect(() => {
    const hash = window.location.hash
    if (!hash.startsWith('#team-')) return
    const target = document.querySelector(hash)
    target?.scrollIntoView({behavior: 'smooth', block: 'start'})
  }, [teams])

  useEffect(() => {
    if (!selectedTeamId && managedTeams[0]) setSelectedTeamId(managedTeams[0].id)
    else if (selectedTeamId && !managedTeams.some((team) => team.id === selectedTeamId)) setSelectedTeamId(managedTeams[0]?.id ?? '')
  }, [managedTeams, selectedTeamId])

  const teamDirectory = useMemo(() => (
    <div className="settings-team-directory">
      <div className="settings-rail-kicker">TEAM DIRECTORY</div>
      {isSystemAdmin && <TerminalInlineAction tone="success" onClick={() => setShowCreateTeam(true)}>新建团队</TerminalInlineAction>}
      <div className="settings-team-directory-list">
        {managedTeams.map((team) => {
          const members = teamMembers[team.id] ?? []
          return <button key={team.id} type="button" aria-pressed={selectedTeam?.id === team.id} onClick={() => setSelectedTeamId(team.id)}><span><TerminalStatus tone={selectedTeam?.id === team.id ? 'success' : 'neutral'}>{team.name}</TerminalStatus><small>{members.length} members · shared resources</small></span></button>
        })}
      </div>
      <div className="settings-rail-summary"><span>TEAM HEALTH</span><TerminalStatus tone="success">{managedTeams.length} active teams</TerminalStatus><TerminalStatus>{Object.values(teamMembers).flat().length} memberships</TerminalStatus></div>
    </div>
  ), [isSystemAdmin, managedTeams, selectedTeam?.id, teamMembers])
  useUnifiedSidebar(teamDirectory, {label: '团队目录', deps: [isSystemAdmin, managedTeams, selectedTeam?.id, teamMembers]})

  const teamResourceContext = selectedTeam ? (
    <div className="settings-resource-ledger">
      <span className="settings-context-kicker">RESOURCE LEDGER</span>
      <h3>{selectedTeam.name} / access surface</h3>
      <section><header><span>MEMBERS</span><strong>{selectedMembers.length}</strong></header>{selectedMembers.map((member) => <p key={member.user.id}>{member.user.displayName || member.user.username}<small>{member.role}</small></p>)}</section>
      <section><header><span>SHARED ACCESS</span><strong>{selectedTeam.role === 'admin' ? 'ADMIN' : 'MEMBER'}</strong></header><p>Connections & log sessions<small>team namespace</small></p></section>
      {isSystemAdmin && <div className="settings-danger-zone"><span>DANGER ZONE</span><TerminalInlineAction tone="danger" disabled={teamPending[selectedTeam.id]} onClick={() => setPendingAction({type: 'delete-team', team: selectedTeam})}>删除</TerminalInlineAction></div>}
    </div>
  ) : null
  useUnifiedContext(teamResourceContext, {label: '团队资源', deps: [selectedTeam?.id, selectedMembers, isSystemAdmin, teamPending[selectedTeam?.id ?? '']]})

  async function submitTeam(name: string) {
    setCreatingTeam(true)
    setError('')
    setSuccess('')
    try {
      const created = await client.createTeam(name)
      const members = await client.listTeamMembers(created.id).catch(() => [])
      setTeams((current) => [...current.filter((team) => team.id !== created.id), created].sort((a, b) => a.name.localeCompare(b.name)))
      ctx.setTeamMembers((current) => ({...current, [created.id]: members}))
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

  async function saveTeamMembers(team: TeamSummary, draft: TeamMemberDraft[]) {
    const current = teamMembers[team.id] ?? []
    const currentMap = new Map(current.map((member) => [member.user.id, member.role]))
    const nextMap = new Map(draft.filter((item) => item.joined).map((item) => [item.userId, item.role]))

    setSavingMembers(true)
    setError('')
    setSuccess('')
    try {
      for (const [userId, role] of nextMap) {
        if (!currentMap.has(userId)) {
          await client.addMember(team.id, {userId, role})
        } else if (currentMap.get(userId) !== role) {
          await client.updateMemberRole(team.id, userId, role)
        }
      }
      for (const userId of currentMap.keys()) {
        if (!nextMap.has(userId)) {
          await client.removeMember(team.id, userId)
        }
      }
      await refreshMembers(team.id)
      setManagingTeam(null)
      setSuccess(`已更新 ${team.name} 的成员`)
    } catch (err) {
      setError(settingsErrorMessage(err))
    } finally {
      setSavingMembers(false)
    }
  }

  const editingTeam = managedTeams.find((team) => team.id === editingTeamId) ?? null

  return (
    <>
      <section className="settings-management-workspace" aria-labelledby="teams-heading">
        <header className="settings-page-toolbar">
          <div>
            <h2 id="teams-heading">{selectedTeam?.name ?? '团队'}</h2>
            <p>成员关系、角色与资源访问边界</p>
          </div>
          {selectedTeam && (isSystemAdmin || selectedTeam.role === 'admin') && <div className="settings-toolbar-actions"><TerminalInlineAction onClick={() => setManagingTeam(selectedTeam)}>成员</TerminalInlineAction><TerminalInlineAction tone="info" onClick={() => { setEditingTeamId(selectedTeam.id); setTeamDrafts((current) => ({...current, [selectedTeam.id]: selectedTeam.name})) }}>重命名</TerminalInlineAction></div>}
        </header>
        {selectedTeam ? <div className="settings-membership-workspace">
          <div className="settings-workspace-tabs"><button type="button" aria-current="page">MEMBERS <strong>{selectedMembers.length}</strong></button><button type="button">ACCESS POLICY</button><button type="button">ACTIVITY</button></div>
          <div className="settings-terminal-table-wrap"><table className="settings-terminal-table" aria-label="团队成员"><thead><tr><th>MEMBER</th><th>LOGIN</th><th>TEAM ROLE</th><th>STATE</th></tr></thead><tbody>{selectedMembers.map((member) => <tr key={member.user.id}><th scope="row">{member.user.displayName || member.user.username}</th><td><code>{member.user.username}</code></td><td>{member.role === 'admin' ? 'TEAM ADMIN' : 'MEMBER'}</td><td><TerminalStatus tone={member.user.disabled ? 'warning' : 'success'}>{member.user.disabled ? 'DISABLED' : 'ACTIVE'}</TerminalStatus></td></tr>)}</tbody></table></div>
          <div className="settings-membership-note">ROLE NOTE / Team admins can manage membership and shared resources.</div>
        </div> : <div className="settings-empty-workspace"><EmptyState title="暂无可管理团队" description={isSystemAdmin ? '新建团队后即可分配成员与共享资源。' : '你当前没有团队管理员权限。'} /></div>}
      </section>

      {editingTeam && (
        <FormDialog title={`重命名 ${editingTeam.name}`} submitLabel="保存名称" submitting={Boolean(teamPending[editingTeam.id])} onCancel={() => setEditingTeamId('')} onSubmit={(event) => { event.preventDefault(); void saveTeamName(editingTeam) }}>
          <TextField label="团队名称" value={teamDrafts[editingTeam.id] ?? editingTeam.name} onChange={(event) => setTeamDrafts((current) => ({...current, [editingTeam.id]: event.target.value}))} />
        </FormDialog>
      )}

      {showCreateTeam && (
        <CreateTeamDialog
          submitting={creatingTeam}
          onCancel={() => setShowCreateTeam(false)}
          onSubmit={submitTeam}
        />
      )}

      {managingTeam && (
        <TeamMembersDialog
          key={`${managingTeam.id}-${(teamMembers[managingTeam.id] ?? []).map((member) => `${member.user.id}:${member.role}`).join(',')}`}
          teamName={managingTeam.name}
          users={users}
          members={teamMembers[managingTeam.id] ?? []}
          submitting={savingMembers}
          onCancel={() => setManagingTeam(null)}
          onSubmit={(draft) => saveTeamMembers(managingTeam, draft)}
        />
      )}

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
    </>
  )
}
