import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import { AuthProvider } from '../auth/AuthProvider'
import type { AuthSession } from '../auth/types'
import { SettingsPage } from './SettingsPage'
import type { SettingsClient, TeamSummary, UserSummary } from '../settings/client'

function session(role: string, teams: {id: string; name: string; role: string}[] = []): AuthSession {
  return {
    user: {id: 'usr_alice', username: 'alice', displayName: 'Alice', systemRole: role},
    teams,
    csrfToken: 'csrf-test',
  }
}

function fakeClient(overrides: Partial<SettingsClient> = {}): SettingsClient {
  const users: UserSummary[] = [{id: 'usr_alice', username: 'alice', displayName: 'Alice', systemRole: 'member', disabled: false}]
  const teams: TeamSummary[] = []
  return {
    listUsers: vi.fn(async () => users),
    createUser: vi.fn(async (input) => ({id: 'usr_new', username: input.username, displayName: input.displayName, systemRole: input.systemRole, disabled: false})),
    listTeams: vi.fn(async () => teams),
    createTeam: vi.fn(async (name) => ({id: 'team_new', name, role: 'admin'})),
    addMember: vi.fn(async () => undefined),
    ...overrides,
  }
}

function renderSettings(authSession: AuthSession, client: SettingsClient) {
  return render(
    <AuthProvider initialSession={authSession}>
      <SettingsPage client={client} />
    </AuthProvider>,
  )
}

it('shows members their profile and memberships only', async () => {
  const client = fakeClient({
    listTeams: vi.fn(async () => [{id: 'team_one', name: 'Team One', role: 'member'}]),
  })
  renderSettings(session('member', [{id: 'team_one', name: 'Team One', role: 'member'}]), client)

  expect(await screen.findByRole('heading', {name: '设置'})).toBeVisible()
  expect(screen.getByText('Alice')).toBeVisible()
  expect(await screen.findByText('Team One')).toBeVisible()
  expect(screen.queryByRole('button', {name: '创建用户'})).not.toBeInTheDocument()
  expect(screen.queryByRole('button', {name: '创建团队'})).not.toBeInTheDocument()
  expect(screen.queryByText(/添加成员/)).not.toBeInTheDocument()
})

it('lets system admins create users and teams without rendering passwords back', async () => {
  const client = fakeClient({
    listUsers: vi.fn(async () => [{id: 'usr_alice', username: 'alice', displayName: 'Alice', systemRole: 'admin', disabled: false}]),
  })
  renderSettings(session('admin'), client)

  await screen.findByRole('button', {name: '创建用户'})
  await userEvent.type(screen.getByLabelText('用户名'), 'bob')
  await userEvent.type(screen.getByLabelText('显示名称'), 'Bob')
  await userEvent.type(screen.getByLabelText('初始密码'), 'super-secret')
  await userEvent.click(screen.getByRole('button', {name: '创建用户'}))

  await waitFor(() => expect(client.createUser).toHaveBeenCalledWith({
    username: 'bob',
    displayName: 'Bob',
    password: 'super-secret',
    systemRole: 'member',
  }))
  expect(await screen.findByRole('status')).toHaveTextContent('用户已创建')
  expect(screen.queryByDisplayValue('super-secret')).not.toBeInTheDocument()
  expect(screen.getByRole('button', {name: '创建团队'})).toBeVisible()
})

it('shows add-member forms only for teams the user administers', async () => {
  const client = fakeClient({
    listTeams: vi.fn(async () => [
      {id: 'team_one', name: 'Team One', role: 'admin'},
      {id: 'team_two', name: 'Team Two', role: 'member'},
    ]),
  })
  renderSettings(session('member', [
    {id: 'team_one', name: 'Team One', role: 'admin'},
    {id: 'team_two', name: 'Team Two', role: 'member'},
  ]), client)

  expect(await screen.findByRole('form', {name: '添加成员 - Team One'})).toBeVisible()
  expect(screen.queryByRole('form', {name: '添加成员 - Team Two'})).not.toBeInTheDocument()
  await userEvent.type(screen.getByLabelText('Team One 成员用户 ID'), 'usr_bob')
  await userEvent.click(screen.getByRole('button', {name: '添加 Team One 成员'}))

  await waitFor(() => expect(client.addMember).toHaveBeenCalledWith('team_one', {userId: 'usr_bob', role: 'member'}))
})
