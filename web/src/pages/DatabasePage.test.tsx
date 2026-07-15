import {render, screen, waitFor} from '@testing-library/react'
import {MemoryRouter} from 'react-router-dom'
import {describe, expect, it, vi} from 'vitest'
import type {WorkbenchAPI} from '../app/DatabaseWorkbench'
import type {Connection} from '../connections/types'
import {UnifiedShellTestHarness} from '../layout/UnifiedShellTestHarness'
import {DatabasePage} from './DatabasePage'

const registryConnection: Connection = {
  id: 'conn_saved', name: 'Primary', kind: 'database', driver: 'postgres', scope: 'personal',
  endpoint: {host: 'db.internal', port: 5432}, config: {database: 'app'}, hasSecret: true,
}

function fakeWorkbenchAPI() {
  return {
    createSession: vi.fn(async () => 'session-1'),
    connect: vi.fn(),
    connectSaved: vi.fn(async () => ({connectionId: 'runtime-1', database: 'app'})),
    disconnect: vi.fn(async () => undefined),
    listDatabases: vi.fn(async () => ({databases: ['app'], current: 'app'})),
    switchDatabase: vi.fn(async (_id: string, database: string) => database),
    metadata: vi.fn(async () => []),
    startQuery: vi.fn(), queryResult: vi.fn(), cancelQuery: vi.fn(), exportCSV: vi.fn(), beginTransaction: vi.fn(), finishTransaction: vi.fn(), mutate: vi.fn(),
    tableDetail: vi.fn(), previewSchema: vi.fn(), executeSchema: vi.fn(), capabilities: vi.fn(), mongoFind: vi.fn(), mongoAggregate: vi.fn(), mongoMutate: vi.fn(),
    mongoCollectionDetail: vi.fn(), mongoCreateIndex: vi.fn(), mongoDropIndex: vi.fn(), redisScanKeys: vi.fn(), redisGetKey: vi.fn(), redisSaveKey: vi.fn(),
    redisDeleteKey: vi.fn(), redisSetTTL: vi.fn(), redisCommands: vi.fn(),
  }
}

function renderDatabase(path: string, connections: Connection[], api = fakeWorkbenchAPI()) {
  const client = {list: vi.fn(async () => connections)}
  render(<MemoryRouter initialEntries={[path]}><UnifiedShellTestHarness><DatabasePage client={client} api={api as unknown as WorkbenchAPI} /></UnifiedShellTestHarness></MemoryRouter>)
  return {api, client}
}

describe('DatabasePage', () => {
  it('lists the same v2 connection returned by Connection Center', async () => {
    renderDatabase('/database', [registryConnection])
    expect(await screen.findByRole('button', {name: '连接 Primary'})).toBeVisible()
  })

  it('auto-connects the v2 connection selected in the URL', async () => {
    const api = fakeWorkbenchAPI()
    renderDatabase('/database?connection=conn_saved', [registryConnection], api)
    await waitFor(() => expect(api.connectSaved).toHaveBeenCalledWith('conn_saved'))
    expect(await screen.findAllByText('Primary')).not.toHaveLength(0)
  })

  it('uses Connection Center as the only creation flow', async () => {
    renderDatabase('/database', [])
    expect(await screen.findByRole('link', {name: '前往连接中心'})).toHaveAttribute('href', '/connections')
    expect(screen.queryByRole('dialog', {name: '新建连接'})).not.toBeInTheDocument()
  })
})
