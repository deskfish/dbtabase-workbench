import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { afterEach, expect, it, vi } from 'vitest'
import { AuthProvider } from './AuthProvider'
import { LoginPage } from './LoginPage'
import { setCSRFToken } from './client'

function LocationProbe() {
  const location = useLocation()
  return <span data-testid="path">{location.pathname}</span>
}

afterEach(() => {
  vi.unstubAllGlobals()
  setCSRFToken('')
})

it('submits credentials and navigates into the authenticated console', async () => {
  const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
    user: {id: 'usr_1', username: 'alice', displayName: 'Alice', systemRole: 'admin'},
    csrfToken: 'csrf-login',
  }), {status: 200, headers: {'Content-Type': 'application/json'}}))
  vi.stubGlobal('fetch', fetchMock)

  render(
    <MemoryRouter initialEntries={['/login']}>
      <AuthProvider initialSession={null}>
        <LoginPage />
        <LocationProbe />
      </AuthProvider>
    </MemoryRouter>,
  )

  await userEvent.type(screen.getByLabelText('用户名'), 'alice')
  await userEvent.type(screen.getByLabelText('密码'), 'password')
  await userEvent.click(screen.getByRole('button', {name: '登录'}))

  await waitFor(() => expect(screen.getByTestId('path')).toHaveTextContent('/connections'))
  expect(fetchMock).toHaveBeenCalledWith('/api/auth/login', expect.objectContaining({method: 'POST'}))
})
