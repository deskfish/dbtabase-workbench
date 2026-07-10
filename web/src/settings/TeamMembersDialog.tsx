import {FormEvent, useState} from 'react'
import {FormDialog} from '../features/ui/FormDialog'
import {SelectControl} from '../features/ui/SelectControl'
import {displayUser, teamRoleLabel, teamRoleOptions} from './shared'
import type {TeamMemberSummary, UserSummary} from './client'

export type TeamMemberDraft = {
  userId: string
  joined: boolean
  role: string
}

export function buildTeamMemberDraft(users: UserSummary[], members: TeamMemberSummary[]): TeamMemberDraft[] {
  const memberMap = new Map(members.map((member) => [member.user.id, member.role]))
  return users
    .filter((user) => !user.disabled)
    .map((user) => ({
      userId: user.id,
      joined: memberMap.has(user.id),
      role: memberMap.get(user.id) ?? 'member',
    }))
}

export function TeamMembersDialog({
  teamName,
  users,
  members,
  submitting,
  onCancel,
  onSubmit,
}: {
  teamName: string
  users: UserSummary[]
  members: TeamMemberSummary[]
  submitting: boolean
  onCancel: () => void
  onSubmit: (draft: TeamMemberDraft[]) => void | Promise<void>
}) {
  const [draft, setDraft] = useState<TeamMemberDraft[]>(() => buildTeamMemberDraft(users, members))

  function updateMember(userId: string, patch: Partial<TeamMemberDraft>) {
    setDraft((current) => current.map((item) => item.userId === userId ? {...item, ...patch} : item))
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    await onSubmit(draft)
  }

  const joinedCount = draft.filter((item) => item.joined).length

  return (
    <FormDialog
      wide
      kicker={false}
      title={`维护成员 · ${teamName}`}
      description={`已选择 ${joinedCount} 名成员。勾选用户并设置角色，点击保存后一并生效。`}
      submitLabel="保存"
      submitting={submitting}
      onCancel={onCancel}
      onSubmit={handleSubmit}
    >
      {users.filter((user) => !user.disabled).length === 0 ? (
        <p className="settings-empty">没有可添加的用户。请先在「用户」页创建账号。</p>
      ) : (
        <ul className="user-team-picker-list">
          {users.filter((user) => !user.disabled).map((user) => {
            const member = draft.find((item) => item.userId === user.id)!
            return (
              <li key={user.id} className={`user-team-picker-row ${member.joined ? 'is-joined' : ''}`.trim()}>
                <input
                  type="checkbox"
                  aria-label={`加入 ${displayUser(user)}`}
                  checked={member.joined}
                  onChange={(event) => updateMember(user.id, {joined: event.target.checked})}
                />
                <div className="user-team-picker-name">
                  <strong>{displayUser(user)}</strong>
                  <span>@{user.username}</span>
                </div>
                <SelectControl
                  ariaLabel={`${displayUser(user)} 团队角色`}
                  value={member.role}
                  options={teamRoleOptions}
                  disabled={!member.joined}
                  onChange={(role) => updateMember(user.id, {role})}
                />
              </li>
            )
          })}
        </ul>
      )}
    </FormDialog>
  )
}

export function memberSummaryLabel(members: TeamMemberSummary[]): string {
  if (members.length === 0) return '暂无成员'
  return members.map((member) => `${displayUser(member.user)}（${teamRoleLabel(member.role)}）`).join('、')
}
