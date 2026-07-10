import {FormEvent, useState} from 'react'
import {FormDialog} from '../features/ui/FormDialog'
import {SelectControl} from '../features/ui/SelectControl'
import {TextField} from '../features/ui/TextField'
import {
  buildTeamMembershipDraft,
  UserTeamAssignmentsField,
  type TeamMembershipDraft,
} from './UserTeamAssignmentsField'
import {displayUser, systemRoleOptions, validatePassword} from './shared'
import type {TeamMemberSummary, TeamSummary, UpdateUserInput, UserSummary} from './client'

export type {TeamMembershipDraft} from './UserTeamAssignmentsField'
export {buildTeamMembershipDraft} from './UserTeamAssignmentsField'

export function EditUserDialog({
  user,
  teams,
  teamMembers,
  isSelf,
  submitting,
  onCancel,
  onSubmit,
}: {
  user: UserSummary
  teams: TeamSummary[]
  teamMembers: Record<string, TeamMemberSummary[]>
  isSelf: boolean
  submitting: boolean
  onCancel: () => void
  onSubmit: (input: {
    profile: UpdateUserInput
    teams: TeamMembershipDraft[]
  }) => void | Promise<void>
}) {
  const [profile, setProfile] = useState<UpdateUserInput>({
    displayName: user.displayName || user.username,
    systemRole: user.systemRole,
    disabled: user.disabled,
  })
  const [teamDraft, setTeamDraft] = useState<TeamMembershipDraft[]>(() => buildTeamMembershipDraft(user.id, teams, teamMembers))
  const [password, setPassword] = useState('')
  const [passwordConfirm, setPasswordConfirm] = useState('')
  const [passwordError, setPasswordError] = useState('')

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const trimmedPassword = password.trim()
    if (trimmedPassword || passwordConfirm.trim()) {
      const validation = validatePassword(trimmedPassword)
      if (validation) {
        setPasswordError(validation)
        return
      }
      if (trimmedPassword !== passwordConfirm.trim()) {
        setPasswordError('两次输入的密码不一致')
        return
      }
    }
    setPasswordError('')
    await onSubmit({
      profile: {
        ...profile,
        password: trimmedPassword || undefined,
      },
      teams: teamDraft,
    })
  }

  return (
    <FormDialog
      wide
      kicker={false}
      title={displayUser(user)}
      description={`@${user.username}`}
      submitLabel="保存"
      submitting={submitting}
      onCancel={onCancel}
      onSubmit={handleSubmit}
    >
      <div className="dialog-form-split">
        <TextField
          label="显示名称"
          value={profile.displayName}
          onChange={(event) => setProfile((current) => ({...current, displayName: event.target.value}))}
        />
        <div className="field-block">
          <span>系统角色</span>
          <SelectControl
            ariaLabel="系统角色"
            value={profile.systemRole}
            options={systemRoleOptions}
            onChange={(systemRole) => setProfile((current) => ({...current, systemRole}))}
          />
        </div>
      </div>

      <div className="field-block">
        <span>登录密码</span>
        <div className="dialog-form-split">
          <TextField
            label="新密码"
            type="password"
            autoComplete="new-password"
            placeholder="留空则不修改"
            value={password}
            error={passwordError}
            onChange={(event) => { setPasswordError(''); setPassword(event.target.value) }}
          />
          <TextField
            label="确认新密码"
            type="password"
            autoComplete="new-password"
            placeholder="再次输入新密码"
            value={passwordConfirm}
            onChange={(event) => { setPasswordError(''); setPasswordConfirm(event.target.value) }}
          />
        </div>
        <p className="settings-muted">修改密码后，该用户现有登录会话会被撤销。</p>
      </div>

      <UserTeamAssignmentsField teams={teams} teamDraft={teamDraft} onChange={setTeamDraft} />

      <div className="field-block">
        <span>账号状态</span>
        <SelectControl
          ariaLabel="账号状态"
          value={profile.disabled ? 'disabled' : 'active'}
          disabled={isSelf}
          options={[
            {value: 'active', label: '正常'},
            {value: 'disabled', label: '已禁用'},
          ]}
          onChange={(value) => setProfile((current) => ({...current, disabled: value === 'disabled'}))}
        />
        {isSelf ? (
          <p className="settings-muted">不能禁用自己的账号。</p>
        ) : (
          <p className="settings-muted">禁用后无法登录，现有会话会被撤销。</p>
        )}
      </div>
    </FormDialog>
  )
}
