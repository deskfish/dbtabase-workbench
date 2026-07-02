import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, expect, it, vi } from 'vitest'
import { App, type WorkbenchAPI } from './App'
import { saveProfile } from '../storage/profile'

function fakeAPI(): WorkbenchAPI {
  return {
    createSession: vi.fn().mockResolvedValue('session'),
    connect: vi.fn().mockResolvedValue({connectionId:'connection', database:'flySense'}),
    disconnect: vi.fn().mockResolvedValue(undefined),
    listDatabases: vi.fn().mockResolvedValue({databases:['flySense'], current:'flySense'}),
    switchDatabase: vi.fn().mockResolvedValue('flySense'),
    metadata: vi.fn().mockResolvedValue([
      {kind:'table', schema:'public', name:'call_recording'},
      {kind:'column', schema:'public', parent:'call_recording', name:'id', dataType:'bigint'},
    ]),
    startQuery: vi.fn().mockResolvedValue('query-1'),
    queryResult: vi.fn().mockResolvedValue({
      queryId:'query-1',
      columns:[{name:'id'},{name:'name'}],
      rows:[[1,'Ada']],
      durationMs:4,
    }),
    cancelQuery: vi.fn().mockResolvedValue(undefined),
    exportCSV: vi.fn().mockResolvedValue(new Blob()),
    beginTransaction: vi.fn().mockResolvedValue('tx-1'),
    finishTransaction: vi.fn().mockResolvedValue(undefined),
    mutate: vi.fn().mockResolvedValue(undefined),
    tableDetail: vi.fn().mockResolvedValue({table:{schema:'public',name:'call_recording',columns:[],indexes:[],foreignKeys:[]},capabilities:{schemaEdit:true,indexEdit:true,foreignKeyEdit:true,transactionalDDL:true},permissions:[]}),
    previewSchema: vi.fn().mockResolvedValue({statements:[],risks:[],fingerprint:'f',token:'t',expiresAt:1}),
    executeSchema: vi.fn().mockResolvedValue({results:[]}),
    listPersonalConnections: vi.fn().mockResolvedValue([]),
    upsertPersonalConnection: vi.fn().mockResolvedValue({}),
    deletePersonalConnection: vi.fn().mockResolvedValue(undefined),
    migratePersonalConnections: vi.fn().mockResolvedValue([]),
    listTeamConnections: vi.fn().mockResolvedValue([]),
    shareConnectionToTeam: vi.fn().mockResolvedValue({}),
    copyTeamConnection: vi.fn().mockResolvedValue({}),
  }
}

beforeEach(() => {
  localStorage.clear()
  saveProfile({nickname: '测试员'})
})

it('executes SQL and renders returned rows', async () => {
  const api = fakeAPI()
  render(<App api={api} sessionBootstrap={Promise.resolve('session')} initialConnectionId="connection" initialSQL="SELECT id, name FROM people" />)
  await userEvent.click(screen.getByRole('button', {name:'执行 SQL'}))
  expect(await screen.findByRole('cell', {name:'Ada'})).toBeVisible()
  expect(api.startQuery).toHaveBeenCalledWith('connection', 'SELECT id, name FROM people', expect.anything())
})

it('requires object-name confirmation before DROP', async () => {
  const api = fakeAPI()
  render(<App api={api} sessionBootstrap={Promise.resolve('session')} initialConnectionId="connection" initialSQL="DROP TABLE invoices" />)
  await userEvent.click(screen.getByRole('button', {name:'执行 SQL'}))
  expect(screen.getByRole('dialog', {name:'确认危险操作'})).toBeVisible()
  expect(api.startQuery).not.toHaveBeenCalled()
})

it('opens a table tab and loads rows without tab-open race', async () => {
  const api = fakeAPI()
  render(<App api={api} sessionBootstrap={Promise.resolve('session')} initialConnectionId="connection" />)
  await userEvent.click(await screen.findByRole('treeitem', {name:/call_recording/}))
  await waitFor(() => expect(api.startQuery).toHaveBeenCalledWith(
    'connection',
    expect.stringContaining('FROM public.call_recording'),
    expect.anything(),
  ))
  expect(await screen.findByRole('cell', {name:'1'})).toBeVisible()
  expect(screen.queryByText('无法打开表标签，请重试')).not.toBeInTheDocument()
})
