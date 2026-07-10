import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { expect, it } from 'vitest'
import { AppRouter } from './AppRouter'
import { AuthProvider } from '../auth/AuthProvider'
import type { AuthSession } from '../auth/types'

function fakeSession(): AuthSession {
  return {
    user: {id: 'usr_1', username: 'alice', displayName: 'Alice', systemRole: 'member'},
    teams: [],
    csrfToken: 'csrf-test',
  }
}

function renderRouter(value: {session: AuthSession | null}, entries: string[]) {
  return render(
    <MemoryRouter initialEntries={entries}>
      <AuthProvider initialSession={value.session}>
        <AppRouter />
      </AuthProvider>
    </MemoryRouter>,
  )
}

it('redirects guests to login and authenticated users to connections', async () => {
  const guest = renderRouter({session: null}, ['/database'])
  expect(await screen.findByRole('button', {name: '登录'})).toBeVisible()
  guest.unmount()

  renderRouter({session: fakeSession()}, ['/'])
  expect(await screen.findByRole('heading', {name: '连接中心'})).toBeVisible()
})

it('keeps one global navigation and marks the current route', async () => {
  renderRouter({session: fakeSession()}, ['/connections'])
  expect(await screen.findByRole('navigation')).toBeInTheDocument()
  expect(screen.getAllByRole('main')).toHaveLength(1)
  expect(screen.getByRole('link', {name: '连接中心'})).toHaveAttribute('aria-current', 'page')
})
