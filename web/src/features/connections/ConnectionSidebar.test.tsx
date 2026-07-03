import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import { ConnectionSidebar } from './ConnectionSidebar'

const saved = [{
  id: 'one',
  name: 'Reporting',
  driver: 'postgres' as const,
  host: '192.168.6.100',
  port: 5432,
  database: 'reports',
  user: 'postgres',
  tlsMode: 'prefer',
  password: 'secret',
  lastConnectedAt: 1,
}]

it('renders saved connections and triggers selection', async () => {
  const onSelect = vi.fn()
  render(<ConnectionSidebar
    nickname="小明"
    savedConnections={saved}
    teamConnections={[]}
    activeSavedId=""
    connected={false}
    connectingId=""
    activeDriver=""
    activeDatabase=""
    databases={[]}
    switchingDatabase={false}
    objects={[]}
    onEditProfile={() => {}}
    onNewConnection={() => {}}
    onSelectConnection={onSelect}
    onEditConnection={() => {}}
    onDeleteConnection={() => {}}
    onShareConnectionToTeam={() => {}}
    onCopyTeamConnection={() => {}}
    onSwitchDatabase={() => {}}
    onCreateDatabase={() => {}}
    onCreateTable={() => {}}
    onDeleteDatabase={() => {}}
    onOpenTable={() => {}}
    onOpenTableStructure={() => {}}
    onNewQuery={() => {}}
    onDeleteTable={() => {}}
  />)
  expect(screen.getByText('Reporting')).toBeVisible()
  expect(screen.getByText('PostgreSQL')).toBeVisible()
  expect(screen.queryByRole('complementary', {name: '数据库目录'})).not.toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', {name: '连接 Reporting'}))
  expect(onSelect).toHaveBeenCalledWith(saved[0])
})

it('filters personal connections and exposes selected connection actions in the fixed footer', async () => {
  const user = userEvent.setup()
  const onEdit = vi.fn()
  const onDelete = vi.fn()
  const onShare = vi.fn()
  render(<ConnectionSidebar
    nickname="小明"
    savedConnections={[saved[0], {...saved[0], id: 'two', name: 'Analytics', host: '10.10.80.122'}]}
    teamConnections={[]}
    activeSavedId="one"
    connected
    connectingId=""
    activeDriver="postgres"
    activeDatabase="reports"
    databases={['reports']}
    switchingDatabase={false}
    objects={[]}
    onEditProfile={() => {}}
    onNewConnection={() => {}}
    onSelectConnection={() => {}}
    onEditConnection={onEdit}
    onDeleteConnection={onDelete}
    onShareConnectionToTeam={onShare}
    onCopyTeamConnection={() => {}}
    onSwitchDatabase={() => {}}
    onCreateDatabase={() => {}}
    onCreateTable={() => {}}
    onDeleteDatabase={() => {}}
    onOpenTable={() => {}}
    onOpenTableStructure={() => {}}
    onNewQuery={() => {}}
    onDeleteTable={() => {}}
  />)

  await user.type(screen.getByRole('searchbox', {name: '搜索个人连接'}), '10.10')
  expect(screen.getByText('Analytics')).toBeVisible()
  expect(screen.queryByText('Reporting')).not.toBeInTheDocument()

  await user.clear(screen.getByRole('searchbox', {name: '搜索个人连接'}))
  expect(screen.getByRole('complementary', {name: '数据库目录'})).toBeVisible()
  await user.click(screen.getByRole('button', {name: '编辑当前连接'}))
  await user.click(screen.getByRole('button', {name: '分享当前连接'}))
  await user.click(screen.getByRole('button', {name: '删除当前连接'}))
  expect(onEdit).toHaveBeenCalledWith(saved[0])
  expect(onShare).toHaveBeenCalledWith(saved[0])
  expect(onDelete).toHaveBeenCalledWith(saved[0])
})
