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
    onOpenTable={() => {}}
    onNewQueryFromTable={() => {}}
    onCopyTableName={() => {}}
    onRefreshTable={() => {}}
    onCopyColumnName={() => {}}
    onNewQueryFromColumn={() => {}}
  />)
  expect(screen.getByText('小明')).toBeVisible()
  expect(screen.getByText('Reporting')).toBeVisible()
  expect(screen.getByRole('complementary', {name: '数据库目录'})).toBeVisible()
  await userEvent.click(screen.getByRole('button', {name: '连接 Reporting'}))
  expect(onSelect).toHaveBeenCalledWith(saved[0])
})
