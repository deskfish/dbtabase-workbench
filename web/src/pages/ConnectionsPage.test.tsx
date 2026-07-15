import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import { AuthProvider } from '../auth/AuthProvider'
import type { AuthSession } from '../auth/types'
import type { ConnectionsClient } from '../connections/client'
import type { Connection, ConnectionFilters, SaveInput } from '../connections/types'
import type { SettingsClient, TeamSummary, UserSummary } from '../settings/client'
import { ConnectionsPage } from './ConnectionsPage'
import { UnifiedShellTestHarness } from '../layout/UnifiedShellTestHarness'

const records: Connection[] = [
  {id: 'conn_db', name: 'Analytics', kind: 'database', driver: 'postgres', scope: 'personal', ownerUserId: 'usr_alice', endpoint: {host: 'db.internal', port: 5432}, config: {database: 'app'}, hasSecret: true},
  {id: 'conn_ssh', name: 'Bastion', kind: 'ssh', driver: 'ssh', scope: 'team', teamId: 'team_one', endpoint: {host: 'bastion.internal', port: 22}, config: {}, hasSecret: true},
]

function authSession(): AuthSession {
  return {
    user: {id: 'usr_alice', username: 'alice', displayName: 'Alice', systemRole: 'admin'},
    teams: [{id: 'team_one', name: 'Team One', role: 'admin'}],
    csrfToken: 'csrf-test',
  }
}

function fakeSettings(): SettingsClient {
  const teams: TeamSummary[] = [{id: 'team_one', name: 'Team One', role: 'admin'}]
  return {
    listUsers: vi.fn(async (): Promise<UserSummary[]> => []),
    createUser: vi.fn(),
    updateUser: vi.fn(),
    deleteUser: vi.fn(),
    setUserTeams: vi.fn(),
    listTeams: vi.fn(async () => teams),
    createTeam: vi.fn(),
    updateTeam: vi.fn(),
    deleteTeam: vi.fn(),
    listTeamMembers: vi.fn(async () => []),
    addMember: vi.fn(),
    updateMemberRole: vi.fn(),
    removeMember: vi.fn(),
  }
}

function fakeConnections(options: {removeError?: Error} = {}): ConnectionsClient {
  let current = [...records]
  return {
    list: vi.fn(async (filters: ConnectionFilters = {}) => current.filter((item) => (!filters.kind || item.kind === filters.kind) && (!filters.scope || item.scope === filters.scope))),
    create: vi.fn(async (input: SaveInput) => {
      const created = {...input.connection, id: 'conn_new', ownerUserId: 'usr_alice', hasSecret: Boolean(input.secret)} as Connection
      current = [created, ...current]
      return created
    }),
    update: vi.fn(async (id: string, input: SaveInput) => {
      const updated = {...current.find((item) => item.id === id)!, ...input.connection, hasSecret: true}
      current = current.map((item) => item.id === id ? updated : item)
      return updated
    }),
    remove: vi.fn(async (id: string) => {
      if (options.removeError) throw options.removeError
      current = current.filter((item) => item.id !== id)
    }),
  }
}

function renderPage(client = fakeConnections(), settings = fakeSettings()) {
  render(
    <UnifiedShellTestHarness>
      <AuthProvider initialSession={authSession()}>
        <ConnectionsPage client={client} settings={settings} />
      </AuthProvider>
    </UnifiedShellTestHarness>,
  )
  return {client, settings}
}

it('filters all, database, ssh, personal, and team records', async () => {
  renderPage()

  expect(await screen.findByRole('row', {name: /Analytics/})).toBeVisible()
  expect(screen.getByText('Bastion')).toBeVisible()
  expect(screen.getByRole('button', {name: '新建连接'})).toBeInTheDocument()
  expect(screen.getByRole('complementary', {name: '连接筛选'})).toBeInTheDocument()
  expect(screen.getByRole('heading', {name: 'Connections'})).toBeInTheDocument()
  expect(screen.getByRole('searchbox', {name: '筛选连接'})).toBeInTheDocument()
  expect(document.querySelector('.connection-sidebar-body .segmented')).not.toBeInTheDocument()
  expect(await screen.findByRole('button', {name: '删除选中连接'})).toBeInTheDocument()

  await userEvent.click(screen.getByRole('button', {name: '数据库'}))
  expect(await screen.findByRole('row', {name: /Analytics/})).toBeVisible()
  expect(screen.queryByText('Bastion')).not.toBeInTheDocument()

  await userEvent.click(screen.getByRole('button', {name: 'SSH'}))
  expect(await screen.findByRole('row', {name: /Bastion/})).toBeVisible()
  expect(screen.queryByText('Analytics')).not.toBeInTheDocument()

  await userEvent.click(screen.getByRole('button', {name: '团队'}))
  expect(await screen.findByRole('row', {name: /Bastion/})).toBeVisible()
})

it('creates a database record and refreshes the list', async () => {
  const {client} = renderPage()
  await screen.findByRole('row', {name: /Analytics/})

  await userEvent.click(screen.getByRole('button', {name: '新建连接'}))
  expect(screen.getByRole('dialog', {name: '新建连接'})).toBeInTheDocument()
  await userEvent.type(screen.getByLabelText('连接名称'), 'Reporting')
  await userEvent.type(screen.getByLabelText('主机'), 'reporting.internal')
  await userEvent.clear(screen.getByLabelText('数据库名'))
  await userEvent.type(screen.getByLabelText('数据库名'), 'warehouse')
  await userEvent.type(screen.getByLabelText('用户名'), 'ops')
  await userEvent.type(screen.getByLabelText('密码'), 'secret')
  await userEvent.click(screen.getByRole('button', {name: '保存连接'}))

  await waitFor(() => expect(client.create).toHaveBeenCalled())
  expect(client.create).toHaveBeenCalledWith(expect.objectContaining({
    secret: {username: 'ops', password: 'secret'},
  }))
  expect(await screen.findByText('Reporting')).toBeVisible()
})

it('edits records with redacted secret fields and preserves secrets when left blank', async () => {
  const {client} = renderPage()
  await screen.findByRole('row', {name: /Analytics/})
  const row = screen.getByRole('row', {name: /Analytics/})
  await userEvent.click(row)
  expect(row).toHaveAttribute('aria-selected', 'true')
  await userEvent.click(screen.getByRole('button', {name: '编辑选中连接'}))

  expect(screen.getByText('已保存密码；留空则继续保留。')).toBeVisible()
  expect(screen.getByLabelText('密码')).toHaveValue('')
  await userEvent.click(screen.getByRole('button', {name: '保存连接'}))

  await waitFor(() => expect(client.update).toHaveBeenCalled())
  expect(client.update).toHaveBeenCalledWith('conn_db', expect.not.objectContaining({secret: expect.anything()}))
})

it('reveals a selected connection inspector with a real workspace link', async () => {
  renderPage()
  await screen.findByRole('row', {name: /Analytics/})

  await userEvent.click(screen.getByRole('row', {name: /Analytics/}))

  const inspector = screen.getByRole('complementary', {name: '连接详情'})
  expect(inspector).toHaveTextContent('db.internal:5432/app')
  expect(within(inspector).getByRole('link', {name: '打开工作台'})).toHaveAttribute('href', '/database?connection=conn_db')
})

it('shows authorization errors from delete operations', async () => {
  renderPage(fakeConnections({removeError: new Error('没有权限操作该连接')}))
  await screen.findByText('Bastion')
  const row = screen.getByRole('row', {name: /Bastion/})
  await userEvent.click(row)
  await userEvent.click(screen.getByRole('button', {name: '删除选中连接'}))
  await userEvent.click(screen.getByRole('button', {name: '删除连接'}))

  expect(await screen.findByRole('alert')).toHaveTextContent('没有权限操作该连接')
})
