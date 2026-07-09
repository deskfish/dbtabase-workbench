import type {Dispatch, SetStateAction} from 'react'
import type {AuthSession} from '../auth/types'
import type {SettingsClient, TeamMemberSummary, TeamSummary, UserSummary} from './client'
import type {SettingsLoadState} from './useSettingsData'

export type SettingsOutletContext = {
  session: AuthSession
  client: SettingsClient
  state: SettingsLoadState
  users: UserSummary[]
  teams: TeamSummary[]
  teamMembers: Record<string, TeamMemberSummary[]>
  error: string
  success: string
  isSystemAdmin: boolean
  canManageTeams: boolean
  setUsers: Dispatch<SetStateAction<UserSummary[]>>
  setTeams: Dispatch<SetStateAction<TeamSummary[]>>
  setTeamMembers: Dispatch<SetStateAction<Record<string, TeamMemberSummary[]>>>
  setError: Dispatch<SetStateAction<string>>
  setSuccess: Dispatch<SetStateAction<string>>
  refreshMembers: (teamId: string) => Promise<void>
  refreshAllMembers: () => Promise<void>
  reloadSettings: (cancelled?: () => boolean) => Promise<void>
}
