import {useEffect, useState} from 'react'
import {useOutletContext} from 'react-router-dom'
import {ConfirmDialog} from '../features/ui/ConfirmDialog'
import {DataGrid} from '../features/ui/DataGrid'
import {EmptyState} from '../features/ui/EmptyState'
import {FormDialog} from '../features/ui/FormDialog'
import {StatusBadge} from '../features/ui/StatusBadge'
import {TextField} from '../features/ui/TextField'
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

  const managedTeams = manageableTeams(teams, isSystemAdmin)

  useEffect(() => {
    const hash = window.location.hash
    if (!hash.startsWith('#team-')) return
    const target = document.querySelector(hash)
    target?.scrollIntoView({behavior: 'smooth', block: 'start'})
  }, [teams])

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

  function renderTeamRow(team: TeamSummary) {
    const members = teamMembers[team.id] ?? []
    const canManageMembers = isSystemAdmin || team.role === 'admin'

    return (
      <tr key={team.id} id={`team-${team.id}`}>
        <th scope="row">{team.name}</th>
        <td>{members.length}</td>
        <td><StatusBadge tone={team.role === 'admin' ? 'info' : 'neutral'}>{team.role === 'admin' ? '团队管理员' : '成员'}</StatusBadge></td>
        <td>共享连接与日志会话</td>
        <td><div className="settings-row-actions">
          {canManageMembers && <button className="oc-button primary" type="button" onClick={() => setManagingTeam(team)}>维护成员</button>}
          {canManageMembers && <button className="oc-button" type="button" onClick={() => { setEditingTeamId(team.id); setTeamDrafts((current) => ({...current, [team.id]: team.name})) }}>重命名</button>}
          {isSystemAdmin && <button className="oc-button danger" type="button" disabled={teamPending[team.id]} onClick={() => setPendingAction({type: 'delete-team', team})}>删除</button>}
        </div></td>
      </tr>
    )
  }

  const editingTeam = managedTeams.find((team) => team.id === editingTeamId) ?? null

  return (
    <>
      <section className="settings-management-workspace" aria-labelledby="teams-heading">
        <header className="settings-workspace-head">
          <div><strong id="teams-heading">团队</strong><span>成员关系、共享连接与日志资源</span></div>
          {isSystemAdmin && (
            <button className="oc-button primary" type="button" onClick={() => setShowCreateTeam(true)}>
              新建团队
            </button>
          )}
        </header>
        <DataGrid label="团队列表" loading={false} empty={managedTeams.length === 0 ? <EmptyState title="暂无可管理团队" description={isSystemAdmin ? '新建团队后即可分配成员与共享资源。' : '你当前没有团队管理员权限。'} /> : undefined}>
          <thead><tr><th>团队</th><th>成员</th><th>我的角色</th><th>资源</th><th aria-label="操作" /></tr></thead>
          <tbody>{managedTeams.map(renderTeamRow)}</tbody>
        </DataGrid>
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
