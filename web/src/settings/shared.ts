import type {AuthSession} from '../auth/types'
import type {TeamMemberSummary, TeamSummary, UserSummary} from './client'

export const systemRoleOptions = [
  {value: 'member', label: '成员'},
  {value: 'admin', label: '系统管理员'},
]

export const teamRoleOptions = [
  {value: 'member', label: '成员'},
  {value: 'admin', label: '团队管理员'},
]

/** @deprecated use systemRoleOptions or teamRoleOptions */
export const roleOptions = systemRoleOptions

export function displayUser(user: Pick<UserSummary, 'displayName' | 'username'>): string {
  return user.displayName || user.username
}

export function toCurrentUserSummary(user: AuthSession['user']): UserSummary {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    systemRole: user.systemRole,
    disabled: false,
  }
}

export function memberTeams(teams: TeamSummary[]): TeamSummary[] {
  return teams.filter((team) => team.role === 'member' || team.role === 'admin')
}

export function manageableTeams(teams: TeamSummary[], isSystemAdmin: boolean): TeamSummary[] {
  if (isSystemAdmin) return teams
  return teams.filter((team) => team.role === 'admin')
}

export function teamRoleLabel(role: string): string {
  if (role === 'admin') return '团队管理员'
  if (role === 'member') return '成员'
  return '未加入'
}

export function membershipsForUser(
  userId: string,
  teams: TeamSummary[],
  teamMembers: Record<string, TeamMemberSummary[]>,
): {teamId: string; role: string}[] {
  return teams.flatMap((team) => {
    const member = (teamMembers[team.id] ?? []).find((item) => item.user.id === userId)
    return member ? [{teamId: team.id, role: member.role}] : []
  })
}

export function teamsForUser(
  userId: string,
  teams: TeamSummary[],
  teamMembers: Record<string, TeamMemberSummary[]>,
): {teamId: string; name: string; role: string}[] {
  return teams.flatMap((team) => {
    const member = (teamMembers[team.id] ?? []).find((item) => item.user.id === userId)
    return member ? [{teamId: team.id, name: team.name, role: member.role}] : []
  })
}

export function validateCreateUser(input: {username: string; displayName: string; password: string}): string | null {
  if (!input.username.trim()) return '请输入用户名'
  if (!input.password) return '请输入初始密码'
  if (input.password.length < 8) return '初始密码至少 8 位'
  return null
}
