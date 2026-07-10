import { json } from '../auth/client'

export type UserSummary = {
  id: string
  username: string
  displayName: string
  systemRole: string
  disabled: boolean
}

export type TeamSummary = {
  id: string
  name: string
  role: string
}

export type TeamMemberSummary = {
  user: UserSummary
  role: string
}

export type CreateUserInput = {
  username: string
  displayName: string
  password: string
  systemRole: string
}

export type UpdateUserInput = {
  displayName: string
  systemRole: string
  disabled?: boolean
  password?: string
}

export type AddMemberInput = {
  userId: string
  role: string
}

export type UserTeamAssignment = {
  teamId: string
  role: string
}

export type SettingsClient = {
  listUsers(): Promise<UserSummary[]>
  createUser(input: CreateUserInput): Promise<UserSummary>
  updateUser(userId: string, input: UpdateUserInput): Promise<UserSummary>
  deleteUser(userId: string): Promise<void>
  setUserTeams(userId: string, teams: UserTeamAssignment[]): Promise<void>
  listTeams(): Promise<TeamSummary[]>
  createTeam(name: string): Promise<TeamSummary>
  updateTeam(teamId: string, name: string): Promise<TeamSummary>
  deleteTeam(teamId: string): Promise<void>
  listTeamMembers(teamId: string): Promise<TeamMemberSummary[]>
  addMember(teamId: string, input: AddMemberInput): Promise<void>
  updateMemberRole(teamId: string, userId: string, role: string): Promise<void>
  removeMember(teamId: string, userId: string): Promise<void>
}

export const settingsClient: SettingsClient = {
  async listUsers() {
    const result = await json<{users: UserSummary[]}>('/api/users')
    return result.users ?? []
  },
  async createUser(input) {
    const result = await json<{user: UserSummary}>('/api/users', {
      method: 'POST',
      body: JSON.stringify({
        username: input.username,
        displayName: input.displayName,
        password: input.password,
        role: input.systemRole,
      }),
    })
    return result.user
  },
  async updateUser(userId, input) {
    const body: Record<string, unknown> = {
      displayName: input.displayName,
      role: input.systemRole,
    }
    if (input.disabled !== undefined) body.disabled = input.disabled
    if (input.password) body.password = input.password
    const result = await json<{user: UserSummary}>(`/api/users/${encodeURIComponent(userId)}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    })
    return result.user
  },
  async deleteUser(userId) {
    await json<void>(`/api/users/${encodeURIComponent(userId)}`, {method: 'DELETE'})
  },
  async setUserTeams(userId, teams) {
    await json<void>(`/api/users/${encodeURIComponent(userId)}/teams`, {
      method: 'PUT',
      body: JSON.stringify({teams}),
    })
  },
  async listTeams() {
    const result = await json<{teams: TeamSummary[]}>('/api/teams')
    return result.teams ?? []
  },
  async createTeam(name) {
    const result = await json<{team: TeamSummary}>('/api/teams', {
      method: 'POST',
      body: JSON.stringify({name}),
    })
    return result.team
  },
  async updateTeam(teamId, name) {
    const result = await json<{team: TeamSummary}>(`/api/teams/${encodeURIComponent(teamId)}`, {
      method: 'PATCH',
      body: JSON.stringify({name}),
    })
    return result.team
  },
  async deleteTeam(teamId) {
    await json<void>(`/api/teams/${encodeURIComponent(teamId)}`, {method: 'DELETE'})
  },
  async listTeamMembers(teamId) {
    const result = await json<{members: TeamMemberSummary[]}>(`/api/teams/${encodeURIComponent(teamId)}/members`)
    return result.members ?? []
  },
  async addMember(teamId, input) {
    await json<void>(`/api/teams/${encodeURIComponent(teamId)}/members`, {
      method: 'POST',
      body: JSON.stringify(input),
    })
  },
  async updateMemberRole(teamId, userId, role) {
    await json<void>(`/api/teams/${encodeURIComponent(teamId)}/members/${encodeURIComponent(userId)}`, {
      method: 'PATCH',
      body: JSON.stringify({role}),
    })
  },
  async removeMember(teamId, userId) {
    await json<void>(`/api/teams/${encodeURIComponent(teamId)}/members/${encodeURIComponent(userId)}`, {
      method: 'DELETE',
    })
  },
}
