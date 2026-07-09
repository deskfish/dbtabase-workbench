import {useCallback, useEffect, useState} from 'react'
import type {AuthSession} from '../auth/types'
import {settingsClient, type SettingsClient, type TeamMemberSummary, type TeamSummary, type UserSummary} from './client'
import {toCurrentUserSummary} from './shared'

export type SettingsLoadState = 'loading' | 'ready' | 'error'

export function useSettingsData(session: AuthSession | null, client: SettingsClient = settingsClient) {
  const [state, setState] = useState<SettingsLoadState>('loading')
  const [users, setUsers] = useState<UserSummary[]>([])
  const [teams, setTeams] = useState<TeamSummary[]>([])
  const [teamMembers, setTeamMembers] = useState<Record<string, TeamMemberSummary[]>>({})
  const [error, setError] = useState('')

  const loadTeamMembers = useCallback(async (loadedTeams: TeamSummary[]) => {
    const pairs = await Promise.all(loadedTeams.map(async (team) => {
      try {
        return [team.id, await client.listTeamMembers(team.id)] as const
      } catch {
        return [team.id, []] as const
      }
    }))
    return Object.fromEntries(pairs) as Record<string, TeamMemberSummary[]>
  }, [client])

  const reloadSettings = useCallback(async (cancelled: () => boolean = () => false) => {
    if (!session) return
    setState('loading')
    setError('')
    try {
      const [loadedUsers, loadedTeams] = await Promise.all([
        client.listUsers(),
        client.listTeams(),
      ])
      const loadedMembers = await loadTeamMembers(loadedTeams)
      if (cancelled()) return
      setUsers(loadedUsers.length > 0 ? loadedUsers : [toCurrentUserSummary(session.user)])
      setTeams(loadedTeams)
      setTeamMembers(loadedMembers)
      setState('ready')
    } catch (err) {
      if (cancelled()) return
      setUsers([toCurrentUserSummary(session.user)])
      setTeams(session.teams.map((team) => ({id: team.id, name: team.name, role: team.role})))
      setTeamMembers({})
      setState('error')
      setError(err instanceof Error ? err.message : '请求失败')
    }
  }, [client, loadTeamMembers, session])

  useEffect(() => {
    let cancelled = false
    void reloadSettings(() => cancelled)
    return () => { cancelled = true }
  }, [reloadSettings])

  const refreshMembers = useCallback(async (teamId: string) => {
    const members = await client.listTeamMembers(teamId)
    setTeamMembers((current) => ({...current, [teamId]: members}))
  }, [client])

  const refreshAllMembers = useCallback(async () => {
    const loadedMembers = await loadTeamMembers(teams)
    setTeamMembers(loadedMembers)
  }, [loadTeamMembers, teams])

  return {
    state,
    users,
    teams,
    teamMembers,
    error,
    setUsers,
    setTeams,
    setTeamMembers,
    setError,
    reloadSettings,
    refreshMembers,
    refreshAllMembers,
  }
}
