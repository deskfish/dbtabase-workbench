import {SelectControl} from '../features/ui/SelectControl'
import {membershipsForUser, teamRoleOptions} from './shared'
import type {TeamMemberSummary, TeamSummary} from './client'

export type TeamMembershipDraft = {
  teamId: string
  joined: boolean
  role: string
}

export function emptyTeamMembershipDraft(teams: TeamSummary[]): TeamMembershipDraft[] {
  return teams.map((team) => ({teamId: team.id, joined: false, role: 'member'}))
}

export function buildTeamMembershipDraft(
  userId: string,
  teams: TeamSummary[],
  teamMembers: Record<string, TeamMemberSummary[]>,
): TeamMembershipDraft[] {
  const memberships = membershipsForUser(userId, teams, teamMembers)
  return teams.map((team) => {
    const membership = memberships.find((item) => item.teamId === team.id)
    return {teamId: team.id, joined: Boolean(membership), role: membership?.role ?? 'member'}
  })
}

export function UserTeamAssignmentsField({
  teams,
  teamDraft,
  onChange,
}: {
  teams: TeamSummary[]
  teamDraft: TeamMembershipDraft[]
  onChange: (draft: TeamMembershipDraft[]) => void
}) {
  function updateTeam(teamId: string, patch: Partial<TeamMembershipDraft>) {
    onChange(teamDraft.map((item) => item.teamId === teamId ? {...item, ...patch} : item))
  }

  return (
    <div className="field-block">
      <span>团队归属</span>
      {teams.length === 0 ? (
        <p className="settings-empty">还没有团队。请先在「团队」页创建。</p>
      ) : (
        <ul className="user-team-picker-list">
          {teams.map((team) => {
            const draft = teamDraft.find((item) => item.teamId === team.id)!
            return (
              <li key={team.id} className={`user-team-picker-row ${draft.joined ? 'is-joined' : ''}`.trim()}>
                <input
                  type="checkbox"
                  aria-label={`加入 ${team.name}`}
                  checked={draft.joined}
                  onChange={(event) => updateTeam(team.id, {joined: event.target.checked})}
                />
                <span className="user-team-picker-name">{team.name}</span>
                <SelectControl
                  ariaLabel={`${team.name} 团队角色`}
                  value={draft.role}
                  options={teamRoleOptions}
                  disabled={!draft.joined}
                  onChange={(role) => updateTeam(team.id, {role})}
                />
              </li>
            )
          })}
        </ul>
      )}
      <p className="settings-muted">勾选团队并设置角色，点击「保存」后一并生效。</p>
    </div>
  )
}
