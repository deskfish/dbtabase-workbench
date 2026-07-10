import {render, screen, waitFor, within} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {MemoryRouter, Outlet, Route, Routes} from 'react-router-dom'
import {expect, it, vi} from 'vitest'
import {AuthProvider} from '../auth/AuthProvider'
import type {AuthSession} from '../auth/types'
import {
  SettingsProfilePage,
  SettingsLayout,
  SettingsTeamsPage,
  SettingsUsersPage,
} from '../settings'
import type {SettingsOutletContext} from '../settings/types'
import type {SettingsClient, TeamMemberSummary, TeamSummary, UserSummary} from '../settings/client'

function session(role: string, teams: {id: string; name: string; role: string}[] = []): AuthSession {
  return {
    user: {id: 'usr_alice', username: 'alice', displayName: 'Alice', systemRole: role},
    teams,
    csrfToken: 'csrf-test',
  }
}

function renderSettingsLayout(authSession: AuthSession, client: SettingsClient) {
  return render(
    <MemoryRouter initialEntries={['/settings/profile']}>
      <AuthProvider initialSession={authSession}>
        <Routes>
          <Route path="/settings" element={<SettingsLayout client={client} />}>
            <Route path="profile" element={<SettingsProfilePage />} />
          </Route>
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  )
}

function fakeClient(overrides: Partial<SettingsClient> = {}): SettingsClient {
  const users: UserSummary[] = [{id: 'usr_alice', username: 'alice', displayName: 'Alice', systemRole: 'member', disabled: false}]
  const teams: TeamSummary[] = []
  const members: TeamMemberSummary[] = [{user: users[0], role: 'member'}]
  return {
    listUsers: vi.fn(async () => users),
    createUser: vi.fn(async (input) => ({id: 'usr_new', username: input.username, displayName: input.displayName, systemRole: input.systemRole, disabled: false})),
    updateUser: vi.fn(async (userId, input) => ({id: userId, username: 'updated', displayName: input.displayName, systemRole: input.systemRole, disabled: Boolean(input.disabled)})),
    setUserTeams: vi.fn(async () => undefined),
    listTeams: vi.fn(async () => teams),
    createTeam: vi.fn(async (name) => ({id: 'team_new', name, role: 'admin'})),
    updateTeam: vi.fn(async (teamId, name) => ({id: teamId, name, role: 'admin'})),
    deleteTeam: vi.fn(async () => undefined),
    listTeamMembers: vi.fn(async () => members),
    addMember: vi.fn(async () => undefined),
    updateMemberRole: vi.fn(async () => undefined),
    removeMember: vi.fn(async () => undefined),
    ...overrides,
  }
}

function mockOutletContext(authSession: AuthSession, client: SettingsClient): SettingsOutletContext {
  return {
    session: authSession,
    client,
    state: 'ready',
    users: [{id: 'usr_alice', username: 'alice', displayName: 'Alice', systemRole: authSession.user.systemRole, disabled: false}],
    teams: authSession.teams.map((team) => ({id: team.id, name: team.name, role: team.role})),
    teamMembers: {},
    error: '',
    success: '',
    isSystemAdmin: authSession.user.systemRole === 'admin',
    canManageTeams: authSession.user.systemRole === 'admin' || authSession.teams.some((team) => team.role === 'admin'),
    setUsers: vi.fn(),
    setTeams: vi.fn(),
    setTeamMembers: vi.fn(),
    setError: vi.fn(),
    setSuccess: vi.fn(),
    refreshMembers: vi.fn(async () => undefined),
    refreshAllMembers: vi.fn(async () => undefined),
    reloadSettings: vi.fn(async () => undefined),
  }
}

function renderHarness(page: 'profile' | 'users' | 'teams', authSession: AuthSession, client: SettingsClient, context?: Partial<SettingsOutletContext>) {
  const outlet = {...mockOutletContext(authSession, client), ...context}
  const Page = page === 'profile' ? SettingsProfilePage : page === 'users' ? SettingsUsersPage : SettingsTeamsPage

  function Parent() {
    return <Outlet context={outlet} />
  }

  return render(
    <MemoryRouter initialEntries={['/']}>
      <AuthProvider initialSession={authSession}>
        <Routes>
          <Route path="/" element={<Parent />}>
            <Route index element={<Page client={client} />} />
          </Route>
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  )
}

it('shows members their profile and memberships only', async () => {
  const client = fakeClient()
  renderHarness('profile', session('member', [{id: 'team_one', name: 'Team One', role: 'member'}]), client, {
    teams: [{id: 'team_one', name: 'Team One', role: 'member'}],
  })

  expect(await screen.findByText('Alice')).toBeVisible()
  expect(await screen.findByText('Team One')).toBeVisible()
})

it('renders settings as a labeled workbench with profile data', async () => {
  const client = fakeClient({
    listUsers: vi.fn(async () => [{id: 'usr_alice', username: 'alice', displayName: 'Alice', systemRole: 'member', disabled: false}]),
    listTeams: vi.fn(async () => [{id: 'team_one', name: 'Team One', role: 'member'}]),
  })
  renderSettingsLayout(session('member', [{id: 'team_one', name: 'Team One', role: 'member'}]), client)

  expect(await screen.findByRole('banner', {name: '设置工具栏'})).toBeInTheDocument()
  expect(screen.getByRole('complementary', {name: '设置分区'})).toBeInTheDocument()
  expect(screen.getByRole('main', {name: '设置工作区'})).toBeInTheDocument()
  expect(screen.getByRole('link', {name: '个人资料'})).toHaveAttribute('aria-current', 'page')
  expect(await screen.findByRole('table', {name: '我的团队'})).toBeInTheDocument()
})

it('lets system admins create users in a modal without rendering passwords back', async () => {
  const user = userEvent.setup()
  const client = fakeClient()
  renderHarness('users', session('admin'), client, {
    users: [{id: 'usr_alice', username: 'alice', displayName: 'Alice', systemRole: 'admin', disabled: false}],
    isSystemAdmin: true,
  })

  await user.click(await screen.findByRole('button', {name: '新建用户'}))
  const dialog = within(screen.getByRole('dialog', {name: '新建用户'}))
  await user.type(dialog.getByLabelText('用户名'), 'bob')
  await user.type(dialog.getByLabelText('显示名称'), 'Bob')
  await user.type(dialog.getByLabelText('初始密码'), 'super-secret-password')
  await user.click(dialog.getByRole('button', {name: '创建用户'}))

  await waitFor(() => expect(client.createUser).toHaveBeenCalledWith({
    username: 'bob',
    displayName: 'Bob',
    password: 'super-secret-password',
    systemRole: 'member',
  }))
  expect(screen.queryByDisplayValue('super-secret-password')).not.toBeInTheDocument()
})

it('shows add-member controls only for teams the user administers', async () => {
  const user = userEvent.setup()
  const client = fakeClient()
  renderHarness('teams', session('member', [
    {id: 'team_one', name: 'Team One', role: 'admin'},
    {id: 'team_two', name: 'Team Two', role: 'member'},
  ]), client, {
    users: [
      {id: 'usr_alice', username: 'alice', displayName: 'Alice', systemRole: 'member', disabled: false},
      {id: 'usr_bob', username: 'bob', displayName: 'Bob', systemRole: 'member', disabled: false},
    ],
    teams: [
      {id: 'team_one', name: 'Team One', role: 'admin'},
      {id: 'team_two', name: 'Team Two', role: 'member'},
    ],
    canManageTeams: true,
  })

  expect(await screen.findByRole('form', {name: '添加成员 - Team One'})).toBeVisible()
  expect(screen.queryByRole('form', {name: '添加成员 - Team Two'})).not.toBeInTheDocument()
  await user.click(screen.getByRole('combobox', {name: 'Team One 选择成员'}))
  await user.click(screen.getByRole('option', {name: 'Bob'}))
  await user.click(screen.getByRole('button', {name: '添加成员'}))

  await waitFor(() => expect(client.addMember).toHaveBeenCalledWith('team_one', {userId: 'usr_bob', role: 'member'}))
})

it('refreshes members after adding a member', async () => {
  const user = userEvent.setup()
  const refreshMembers = vi.fn(async () => undefined)
  const client = fakeClient()
  renderHarness('teams', session('admin', [{id: 'team_one', name: 'Team One', role: 'admin'}]), client, {
    users: [
      {id: 'usr_alice', username: 'alice', displayName: 'Alice', systemRole: 'admin', disabled: false},
      {id: 'usr_bob', username: 'bob', displayName: 'Bob', systemRole: 'member', disabled: false},
    ],
    teams: [{id: 'team_one', name: 'Team One', role: 'admin'}],
    teamMembers: {
      team_one: [{user: {id: 'usr_alice', username: 'alice', displayName: 'Alice', systemRole: 'admin', disabled: false}, role: 'admin'}],
    },
    isSystemAdmin: true,
    canManageTeams: true,
    refreshMembers,
  })

  const memberList = await screen.findByRole('list', {name: 'Team One 成员'})
  expect(within(memberList).getByText('Alice')).toBeVisible()
  await user.click(screen.getByRole('combobox', {name: 'Team One 选择成员'}))
  await user.click(screen.getByRole('option', {name: 'Bob'}))
  await user.click(screen.getByRole('button', {name: '添加成员'}))

  await waitFor(() => expect(refreshMembers).toHaveBeenCalledWith('team_one'))
})

it('lets system admins edit a user without team assignment controls', async () => {
  const user = userEvent.setup()
  const client = fakeClient()
  renderHarness('users', session('admin'), client, {
    users: [
      {id: 'usr_alice', username: 'alice', displayName: 'Alice', systemRole: 'admin', disabled: false},
      {id: 'usr_bob', username: 'bob', displayName: 'Bob', systemRole: 'member', disabled: false},
    ],
    teams: [{id: 'team_one', name: 'Team One', role: 'admin'}],
    teamMembers: {
      team_one: [{user: {id: 'usr_bob', username: 'bob', displayName: 'Bob', systemRole: 'member', disabled: false}, role: 'member'}],
    },
    isSystemAdmin: true,
  })

  const bobRow = screen.getByText('bob').closest('tr')!
  await user.click(within(bobRow).getByRole('button', {name: '编辑'}))
  const nameInput = screen.getByLabelText('显示名称')
  await user.clear(nameInput)
  await user.type(nameInput, 'Robert')
  await user.click(screen.getByRole('button', {name: '保存'}))

  await waitFor(() => expect(client.updateUser).toHaveBeenCalledWith('usr_bob', {displayName: 'Robert', systemRole: 'member', disabled: false}))
  expect(client.setUserTeams).not.toHaveBeenCalled()
  expect(screen.queryByLabelText(/选择团队/)).not.toBeInTheDocument()
})

it('asks before deleting a team', async () => {
  const user = userEvent.setup()
  const client = fakeClient()
  renderHarness('teams', session('admin'), client, {
    teams: [{id: 'team_one', name: 'Team One', role: 'admin'}],
    isSystemAdmin: true,
    canManageTeams: true,
  })

  await user.click(await screen.findByRole('button', {name: '删除'}))
  expect(await screen.findByRole('dialog', {name: /删除团队 Team One/})).toBeVisible()
  await user.click(screen.getByRole('button', {name: '删除团队'}))
  await waitFor(() => expect(client.deleteTeam).toHaveBeenCalledWith('team_one'))
})
