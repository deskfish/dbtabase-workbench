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
    capabilities: vi.fn().mockResolvedValue({queryLanguage:'sql', supportsSqlWorkbench:true}),
    mongoFind: vi.fn(),
    mongoAggregate: vi.fn(),
    mongoMutate: vi.fn(),
    mongoCollectionDetail: vi.fn(),
    mongoCreateIndex: vi.fn(),
    mongoDropIndex: vi.fn(),
    redisScanKeys: vi.fn(),
    redisGetKey: vi.fn(),
    redisSaveKey: vi.fn(),
    redisDeleteKey: vi.fn(),
    redisSetTTL: vi.fn(),
    redisCommands: vi.fn(),
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

it('renders the global database workbench header', () => {
  render(<App api={fakeAPI()} sessionBootstrap={Promise.resolve('session')} />)

  expect(screen.getByRole('banner')).toHaveTextContent('数据库管理')
  expect(screen.getByRole('banner')).toHaveTextContent('MySQL / PostgreSQL / MongoDB / Redis')
  expect(screen.getByRole('banner')).toHaveTextContent('测试员')
})

it('offers useful disconnected workspace actions', async () => {
  render(<App api={fakeAPI()} sessionBootstrap={Promise.resolve('session')} />)
  expect(await screen.findByText('先连接数据库，再开始工作')).toBeVisible()
  await userEvent.click(screen.getByRole('button',{name:'选择连接'}))
  expect(screen.getByRole('searchbox',{name:'搜索个人连接'})).toHaveFocus()
  expect(screen.getAllByRole('button',{name:'新建连接'}).length).toBeGreaterThan(0)
  expect(screen.getAllByRole('button',{name:/团队连接/}).length).toBeGreaterThan(0)
})

it('uses a comment-only SQL guide by default', async () => {
  render(<App api={fakeAPI()} sessionBootstrap={Promise.resolve('session')} initialConnectionId="connection" />)
  expect(await screen.findByRole('textbox',{name:'SQL 编辑器'})).toHaveValue('-- 从左侧选择一张表，或在这里输入 SQL')
  expect(screen.getByRole('button',{name:'执行 SQL'})).toHaveTextContent('运行')
  expect(screen.getByText('⌘/Ctrl Enter')).toBeVisible()
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
