import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import { AuthProvider } from '../auth/AuthProvider'
import type { AuthSession } from '../auth/types'
import { LogsPage } from './LogsPage'
import type { LogsClient, LogSession, LogSearchResult } from '../logs/client'

function session(): AuthSession {
  return {
    user: {id: 'usr_alice', username: 'alice', displayName: 'Alice', systemRole: 'admin'},
    teams: [{id: 'team_one', name: 'Team One', role: 'admin'}],
    csrfToken: 'csrf-test',
  }
}

function fakeClient(): LogsClient {
  const sessions: LogSession[] = []
  const searchResult: LogSearchResult = {
    entries: [{id: 1, sessionId: 'logs_new', sourceFileId: 'file_one', timestampMs: 1783495200000, level: 'ERROR', serviceName: 'api', nodeName: 'a', message: 'failed payment', raw: 'failed payment', lineNumber: 1}],
    total: 1,
    countExact: true,
    tree: [{serviceName: 'api', lineCount: 1, nodes: [{nodeName: 'a', lineCount: 1}]}],
  }
  return {
    listSessions: vi.fn(async () => sessions),
    createSession: vi.fn(async (input) => {
      const created = {id: 'logs_new', name: input.name, status: 'pending', scope: input.scope, teamId: input.teamId, createdAt: '2026-07-08T10:00:00Z', updatedAt: '2026-07-08T10:00:00Z', fileCount: 0, serviceCount: 0}
      sessions.unshift(created)
      return created
    }),
    uploadFile: vi.fn(async () => ({id: 'file_one', sessionId: 'logs_new', serviceName: 'api', nodeName: 'a', originalName: 'api-a.log', totalLines: 1, parseStatus: 'done', sourceType: 'local'})),
    listSshConnections: vi.fn(async () => [{id: 'conn_ssh', name: 'Team SSH', scope: 'team', teamId: 'team_one', endpoint: {host: 'logs.internal', port: 22}}]),
    testSshConnection: vi.fn(async () => undefined),
    browseSsh: vi.fn(async () => ({path: '/var/log', entries: [{name: 'app.log', path: '/var/log/app.log', type: 'file' as const, size: 128, modifiedAt: 1783495200000}]})),
    scanSsh: vi.fn(async () => ({entries: [{name: 'worker.log', path: '/var/log/service/worker.log', type: 'file' as const, size: 256, modifiedAt: 1783495200000}], truncated: false, maxDepth: 8, maxFiles: 1000})),
    importSshFile: vi.fn(async () => ({id: 'file_remote', sessionId: 'logs_new', serviceName: 'api', nodeName: 'prod', originalName: 'app.log', totalLines: 1, parseStatus: 'done', sourceType: 'ssh_import'})),
    tailSsh: vi.fn(async (input, onEvent) => {
      onEvent({type: 'ready', path: input.path, sourceFile: {id: 'file_tail', sessionId: input.sessionId, serviceName: 'api', nodeName: 'prod', originalName: 'app.log', totalLines: 0, parseStatus: 'done', sourceType: 'ssh_tail'}})
      onEvent({type: 'line', line: '2026-07-08 10:00:00 INFO started', entry: {id: 2, sessionId: input.sessionId, sourceFileId: 'file_tail', timestampMs: 1783495200000, level: 'INFO', serviceName: 'api', nodeName: 'prod', message: 'started', raw: '2026-07-08 10:00:00 INFO started', lineNumber: 1}})
    }),
    search: vi.fn(async () => searchResult),
    timeline: vi.fn(async () => ({bucketSizeMs: 60000, buckets: [{bucketStartMs: 1783495200000, count: 1, errorCount: 1}]})),
    files: vi.fn(async () => ({files: []})),
    removeSession: vi.fn(async () => undefined),
  }
}

function renderLogs(client: LogsClient) {
  return render(
    <AuthProvider initialSession={session()}>
      <LogsPage client={client} />
    </AuthProvider>,
  )
}

it('creates a log session, uploads a file, and searches indexed lines', async () => {
  const client = fakeClient()
  renderLogs(client)

  expect(await screen.findByRole('heading', {name: '日志'})).toBeVisible()
  expect(screen.queryByText(/待迁移/)).not.toBeInTheDocument()

  await userEvent.type(screen.getByLabelText('会话名称'), 'Deploy Logs')
  await userEvent.click(screen.getByRole('button', {name: '创建日志会话'}))
  expect((await screen.findAllByText('Deploy Logs'))[0]).toBeVisible()

  const file = new File(['2026-07-08 10:00:00 ERROR failed payment\n'], 'api-a.log', {type: 'text/plain'})
  await userEvent.upload(screen.getByLabelText('日志文件'), file)
  await userEvent.click(screen.getByRole('button', {name: '上传并索引'}))
  await waitFor(() => expect(client.uploadFile).toHaveBeenCalled())

  await userEvent.type(screen.getByLabelText('搜索日志'), 'failed')
  await userEvent.click(screen.getByRole('button', {name: '搜索'}))

  expect(await screen.findByText('failed payment')).toBeVisible()
  expect(screen.getAllByText('api / a')[0]).toBeVisible()
})

it('browses a saved SSH connection and starts a real-time tail stream', async () => {
  const client = fakeClient()
  renderLogs(client)

  await userEvent.type(await screen.findByLabelText('会话名称'), 'Live SSH Logs')
  await userEvent.click(screen.getByRole('button', {name: '创建日志会话'}))

  expect(await screen.findByText(/Team SSH/)).toBeVisible()
  await userEvent.click(screen.getByRole('button', {name: '浏览目录'}))

  expect(await screen.findByText('app.log')).toBeVisible()
  await userEvent.click(screen.getByRole('button', {name: 'Tail app.log'}))

  await waitFor(() => expect(client.tailSsh).toHaveBeenCalled())
  expect(await screen.findByText(/INFO started/)).toBeVisible()
})

it('imports a remote SSH log file into the selected session', async () => {
  const client = fakeClient()
  renderLogs(client)

  await userEvent.type(await screen.findByLabelText('会话名称'), 'Remote Import')
  await userEvent.click(screen.getByRole('button', {name: '创建日志会话'}))
  await userEvent.click(await screen.findByRole('button', {name: '浏览目录'}))
  await userEvent.click(await screen.findByRole('button', {name: '导入 app.log'}))

  await waitFor(() => expect(client.importSshFile).toHaveBeenCalled())
  expect(await screen.findByText('远程日志已导入并完成索引')).toBeVisible()
})

it('scans a remote SSH directory for log files', async () => {
  const client = fakeClient()
  renderLogs(client)

  await userEvent.type(await screen.findByLabelText('会话名称'), 'Remote Scan')
  await userEvent.click(screen.getByRole('button', {name: '创建日志会话'}))
  await userEvent.click(await screen.findByRole('button', {name: '扫描日志'}))

  await waitFor(() => expect(client.scanSsh).toHaveBeenCalled())
  expect(await screen.findByText('worker.log')).toBeVisible()
})
