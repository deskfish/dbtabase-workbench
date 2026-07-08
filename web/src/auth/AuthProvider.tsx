import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { AuthAPIError, json, setCSRFToken } from './client'
import type { AuthSession, AuthTeam } from './types'

type AuthState = 'loading' | 'guest' | 'ready' | 'error'

type AuthContextValue = {
  session: AuthSession | null
  status: AuthState
  error: string
  login(username: string, password: string): Promise<void>
  logout(): Promise<void>
  reload(): Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

type AuthSessionPayload = Omit<AuthSession, 'teams'> & {
  teams?: AuthTeam[] | Record<string, string>
}

function normalizeTeams(teams: AuthSessionPayload['teams']): AuthTeam[] {
  if (!teams) return []
  if (Array.isArray(teams)) return teams
  return Object.entries(teams).map(([id, role]) => ({id, name: id, role}))
}

function normalizeSession(payload: AuthSessionPayload): AuthSession {
  return {...payload, teams: normalizeTeams(payload.teams)}
}

export function AuthProvider({children, initialSession}: {children: ReactNode; initialSession?: AuthSession | null}) {
  const [session, setSession] = useState<AuthSession | null>(initialSession ?? null)
  const [status, setStatus] = useState<AuthState>(initialSession === undefined ? 'loading' : initialSession ? 'ready' : 'guest')
  const [error, setError] = useState('')

  const applySession = useCallback((next: AuthSession | null) => {
    setSession(next)
    setCSRFToken(next?.csrfToken ?? '')
    setStatus(next ? 'ready' : 'guest')
    setError('')
  }, [])

  const reload = useCallback(async () => {
    setStatus('loading')
    try {
      const next = await json<AuthSessionPayload>('/api/auth/session')
      applySession(normalizeSession(next))
    } catch (err) {
      if (err instanceof AuthAPIError && err.status === 401) {
        applySession(null)
        return
      }
      setStatus('error')
      setError(err instanceof Error ? err.message : '认证状态加载失败')
    }
  }, [applySession])

  useEffect(() => {
    if (initialSession !== undefined) {
      setCSRFToken(initialSession?.csrfToken ?? '')
      return
    }
    void reload()
  }, [initialSession, reload])

  const login = useCallback(async (username: string, password: string) => {
    const next = await json<AuthSessionPayload>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({username, password}),
    })
    applySession(normalizeSession(next))
  }, [applySession])

  const logout = useCallback(async () => {
    try {
      await json<void>('/api/auth/logout', {method: 'POST'})
    } finally {
      applySession(null)
    }
  }, [applySession])

  const value = useMemo(() => ({session, status, error, login, logout, reload}), [session, status, error, login, logout, reload])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth must be used inside AuthProvider')
  return value
}
