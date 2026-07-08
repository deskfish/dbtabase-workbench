import { render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { AuthProvider, useAuth } from './AuthProvider'
import { getCSRFToken, setCSRFToken } from './client'

function Probe() {
  const {session, status, error} = useAuth()
  return (
    <div>
      <span data-testid="status">{status}</span>
      <span data-testid="user">{session?.user.username ?? 'none'}</span>
      <span data-testid="teams">{session?.teams.length ?? 0}</span>
      <span data-testid="error">{error}</span>
    </div>
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
  setCSRFToken('')
})

it('loads the current session and normalizes backend team maps', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
    user: {id: 'usr_1', username: 'alice', displayName: 'Alice', systemRole: 'admin'},
    teams: {team_one: 'admin'},
    csrfToken: 'csrf-test',
  }), {status: 200, headers: {'Content-Type': 'application/json'}})))

  render(<AuthProvider><Probe /></AuthProvider>)

  await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('ready'))
  expect(screen.getByTestId('user')).toHaveTextContent('alice')
  expect(screen.getByTestId('teams')).toHaveTextContent('1')
  expect(getCSRFToken()).toBe('csrf-test')
})

it('treats a missing current session as a guest', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
    error: {code: 'auth_required', message: '需要登录'},
  }), {status: 401, headers: {'Content-Type': 'application/json'}})))

  render(<AuthProvider><Probe /></AuthProvider>)

  await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('guest'))
  expect(screen.getByTestId('user')).toHaveTextContent('none')
})
