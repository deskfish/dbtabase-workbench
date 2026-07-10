import {FormEvent, useState} from 'react'
import {FormDialog} from '../features/ui/FormDialog'
import {SelectControl} from '../features/ui/SelectControl'
import {TextField} from '../features/ui/TextField'
import {emptyTeamMembershipDraft, UserTeamAssignmentsField, type TeamMembershipDraft} from './UserTeamAssignmentsField'
import {systemRoleOptions, validateCreateUser} from './shared'
import type {CreateUserInput, TeamSummary} from './client'

export function CreateUserDialog({
  teams,
  submitting,
  onCancel,
  onSubmit,
}: {
  teams: TeamSummary[]
  submitting: boolean
  onCancel: () => void
  onSubmit: (input: CreateUserInput, teams: TeamMembershipDraft[]) => void | Promise<void>
}) {
  const [profile, setProfile] = useState<CreateUserInput>({
    username: '',
    displayName: '',
    password: '',
    systemRole: 'member',
  })
  const [teamDraft, setTeamDraft] = useState<TeamMembershipDraft[]>(() => emptyTeamMembershipDraft(teams))
  const [error, setError] = useState('')

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const validation = validateCreateUser(profile)
    if (validation) {
      setError(validation)
      return
    }
    setError('')
    await onSubmit({
      ...profile,
      username: profile.username.trim(),
      displayName: profile.displayName.trim(),
    }, teamDraft)
  }

  return (
    <FormDialog
      wide
      kicker={false}
      title="新建用户"
      description="创建登录账号，可同时分配团队。"
      submitLabel="创建用户"
      submitting={submitting}
      onCancel={onCancel}
      onSubmit={handleSubmit}
    >
      <div className="dialog-form-split">
        <TextField
          label="用户名"
          autoComplete="username"
          value={profile.username}
          error={error}
          onChange={(event) => { setError(''); setProfile((current) => ({...current, username: event.target.value})) }}
        />
        <TextField
          label="显示名称"
          autoComplete="name"
          value={profile.displayName}
          onChange={(event) => setProfile((current) => ({...current, displayName: event.target.value}))}
        />
      </div>
      <div className="dialog-form-split">
        <TextField
          label="初始密码"
          type="password"
          autoComplete="new-password"
          value={profile.password}
          onChange={(event) => setProfile((current) => ({...current, password: event.target.value}))}
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
      <UserTeamAssignmentsField teams={teams} teamDraft={teamDraft} onChange={setTeamDraft} />
    </FormDialog>
  )
}
