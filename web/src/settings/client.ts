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

export type CreateUserInput = {
  username: string
  displayName: string
  password: string
  systemRole: string
}

export type AddMemberInput = {
  userId: string
  role: string
}

export type SettingsClient = {
  listUsers(): Promise<UserSummary[]>
  createUser(input: CreateUserInput): Promise<UserSummary>
  listTeams(): Promise<TeamSummary[]>
  createTeam(name: string): Promise<TeamSummary>
  addMember(teamId: string, input: AddMemberInput): Promise<void>
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
  async addMember(teamId, input) {
    await json<void>(`/api/teams/${encodeURIComponent(teamId)}/members`, {
      method: 'POST',
      body: JSON.stringify(input),
    })
  },
}
