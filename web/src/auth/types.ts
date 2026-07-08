export type AuthUser = {
  id: string
  username: string
  displayName: string
  systemRole: string
}

export type AuthTeam = {
  id: string
  name: string
  role: string
}

export type AuthSession = {
  user: AuthUser
  teams: AuthTeam[]
  csrfToken: string
}
