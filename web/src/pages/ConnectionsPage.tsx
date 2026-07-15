import { FormEvent, useEffect, useMemo, useState } from 'react'
import { connectionsClient, type ConnectionsClient } from '../connections/client'
import { ConnectionFormError, defaultDriver, defaultPort, toSaveInput, type ConnectionFormValue } from '../connections/connectionForm'
import type { Connection, ConnectionDriver, ConnectionFilters, ConnectionKind, ConnectionScope } from '../connections/types'
import { useAuth } from '../auth/AuthProvider'
import {ConfirmDialog} from '../features/ui/ConfirmDialog'
import {EmptyState} from '../features/ui/EmptyState'
import {FormDialog} from '../features/ui/FormDialog'
import { SelectControl } from '../features/ui/SelectControl'
import {TerminalCommandFilter, TerminalInlineAction, TerminalStatus} from '../features/ui/TerminalPrimitives'
import {TextAreaField} from '../features/ui/TextAreaField'
import {TextField} from '../features/ui/TextField'
import { useUnifiedContext, useUnifiedRuntime, useUnifiedSidebar, useUnifiedStatus } from '../layout/UnifiedShellContext'
import { settingsClient, type SettingsClient, type TeamSummary } from '../settings/client'
import './ConnectionsPage.css'

type FormMode = 'create' | 'edit'

const kindFilters: {value: ConnectionFilters['kind']; label: string}[] = [
  {value: '', label: '全部'},
  {value: 'database', label: '数据库'},
  {value: 'ssh', label: 'SSH'},
]

const scopeFilters: {value: ConnectionFilters['scope']; label: string}[] = [
  {value: '', label: '全部范围'},
  {value: 'personal', label: '我的'},
  {value: 'team', label: '团队'},
]

const driverOptions = [
  {value: 'postgres', label: 'PostgreSQL'},
  {value: 'mysql', label: 'MySQL'},
  {value: 'mongodb', label: 'MongoDB'},
  {value: 'redis', label: 'Redis'},
]

const sshDriverOptions = [{value: 'ssh', label: 'SSH'}]

const scopeOptions = [
  {value: 'personal', label: '个人'},
  {value: 'team', label: '团队'},
]

function emptyForm(kind: ConnectionKind = 'database'): ConnectionFormValue {
  const driver = defaultDriver(kind)
  return {
    name: '',
    kind,
    driver,
    scope: 'personal',
    teamId: '',
    host: '',
    port: defaultPort(driver),
    database: '',
    username: '',
    password: '',
    privateKey: '',
    passphrase: '',
  }
}

function formFromConnection(connection: Connection): ConnectionFormValue {
  return {
    name: connection.name,
    kind: connection.kind,
    driver: connection.driver,
    scope: connection.scope,
    teamId: connection.teamId ?? '',
    host: connection.endpoint.host,
    port: String(connection.endpoint.port),
    database: typeof connection.config.database === 'string' ? connection.config.database : '',
    username: '',
    password: '',
    privateKey: '',
    passphrase: '',
  }
}

function messageFor(error: unknown): string {
  return error instanceof Error ? error.message : '请求失败'
}

function driverLabel(driver: string): string {
  return driver === 'postgres' ? 'PostgreSQL' : driver === 'mysql' ? 'MySQL' : driver === 'mongodb' ? 'MongoDB' : driver === 'redis' ? 'Redis' : 'SSH'
}

export function ConnectionsPage({client = connectionsClient, settings = settingsClient}: {client?: ConnectionsClient; settings?: SettingsClient}) {
  const {session} = useAuth()
  const [connections, setConnections] = useState<Connection[]>([])
  const [teams, setTeams] = useState<TeamSummary[]>(session?.teams ?? [])
  const [kind, setKind] = useState<ConnectionFilters['kind']>('')
  const [scope, setScope] = useState<ConnectionFilters['scope']>('')
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [formMode, setFormMode] = useState<FormMode | null>(null)
  const [editing, setEditing] = useState<Connection | null>(null)
  const [form, setForm] = useState<ConnectionFormValue>(emptyForm())
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Connection | null>(null)
  const [selectedConnectionId, setSelectedConnectionId] = useState('')

  const adminTeams = useMemo(() => teams.filter((team) => team.role === 'admin'), [teams])
  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return connections
    return connections.filter((connection) => [connection.name, connection.driver, connection.endpoint.host, connection.config.database].some((value) => String(value ?? '').toLowerCase().includes(needle)))
  }, [connections, query])

  const sidebarContent = useMemo(() => (
    <>
      <header className="panel-heading">
        <div><span>CONNECTIONS</span><small>{visible.length} / {connections.length} endpoints</small></div>
      </header>
      <div className="connection-sidebar-body">
        <div className="connection-nav-group" aria-label="类型筛选">
          <span className="connection-sidebar-label">REGISTRY</span>
          {kindFilters.map((item) => (
            <button key={item.label} type="button" aria-label={item.value === '' ? '全部连接' : item.label} data-active={kind === item.value} onClick={() => setKind(item.value)}>
              <span>{item.value === '' ? '全部连接' : item.label}</span>
              <strong>{item.value === '' ? connections.length : connections.filter((connection) => connection.kind === item.value).length}</strong>
            </button>
          ))}
        </div>
        <div className="connection-nav-group" aria-label="范围筛选">
          <span className="connection-sidebar-label">SCOPE</span>
          {scopeFilters.map((item) => (
            <button key={item.label} type="button" aria-label={item.value === '' ? '全部范围' : item.label} data-active={scope === item.value} onClick={() => setScope(item.value)}>
              <span>{item.value === '' ? '全部范围' : item.label}</span>
              <strong>{item.value === '' ? connections.length : connections.filter((connection) => connection.scope === item.value).length}</strong>
            </button>
          ))}
        </div>
        <div className="connection-saved-views">
          <span className="connection-sidebar-label">SAVED VIEWS</span>
          <button type="button" onClick={() => setQuery('prod')}>› production</button>
          <button type="button" onClick={() => setQuery('ssh')}>› ssh endpoints</button>
          <button type="button" onClick={() => setQuery('')}>› clear query</button>
        </div>
      </div>
    </>
  ), [connections, kind, query, scope, visible.length])

  useUnifiedSidebar(sidebarContent, {label: '连接筛选', deps: [kind, scope, query, connections, visible.length]})

  async function load() {
    setLoading(true)
    setError('')
    try {
      const [items, loadedTeams] = await Promise.all([
        client.list({kind, scope}),
        settings.listTeams().catch(() => session?.teams ?? []),
      ])
      setConnections(items)
      setTeams(loadedTeams)
      setSelectedConnectionId((current) => items.some((item) => item.id === current) ? current : items[0]?.id ?? '')
    } catch (err) {
      setError(messageFor(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, scope])

  function openCreate(nextKind: ConnectionKind = 'database') {
    setFieldErrors({})
    setError('')
    setSuccess('')
    setEditing(null)
    setForm(emptyForm(nextKind))
    setFormMode('create')
  }

  function openEdit(connection: Connection) {
    setFieldErrors({})
    setError('')
    setSuccess('')
    setEditing(connection)
    setForm(formFromConnection(connection))
    setFormMode('edit')
  }

  function setFormKind(nextKind: ConnectionKind) {
    const driver = defaultDriver(nextKind)
    setForm((current) => ({...current, kind: nextKind, driver, port: defaultPort(driver), database: nextKind === 'database' ? current.database : ''}))
  }

  function setFormDriver(driver: ConnectionDriver) {
    setForm((current) => ({...current, driver, port: defaultPort(driver)}))
  }

  function setFormScope(nextScope: ConnectionScope) {
    setForm((current) => ({...current, scope: nextScope, teamId: nextScope === 'team' ? current.teamId || adminTeams[0]?.id || '' : ''}))
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    setSaving(true)
    setFieldErrors({})
    setError('')
    setSuccess('')
    try {
      const input = toSaveInput(form, adminTeams)
      if (formMode === 'edit' && editing) {
        await client.update(editing.id, input)
        setSuccess('连接已更新')
      } else {
        await client.create(input)
        setSuccess('连接已创建')
      }
      setFormMode(null)
      setEditing(null)
      await load()
    } catch (err) {
      if (err instanceof ConnectionFormError) setFieldErrors(err.fields)
      else setError(messageFor(err))
    } finally {
      setSaving(false)
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return
    setError('')
    setSuccess('')
    try {
      await client.remove(deleteTarget.id)
      setSuccess('连接已删除')
      setDeleteTarget(null)
      await load()
    } catch (err) {
      setError(messageFor(err))
    }
  }

  const selectedConnection = visible.find((connection) => connection.id === selectedConnectionId) ?? null
  const selectedEndpoint = selectedConnection
    ? `${selectedConnection.endpoint.host}:${selectedConnection.endpoint.port}${selectedConnection.config.database ? `/${selectedConnection.config.database}` : ''}`
    : ''

  const connectionContext = selectedConnection ? (
    <div className="connection-inspector" aria-label="连接详情">
      <header className="connection-inspector-head"><div><span>SELECTION / CONNECTION</span><h3>{selectedConnection.name}</h3></div><TerminalStatus tone={selectedConnection.hasSecret ? 'success' : 'warning'}>{selectedConnection.hasSecret ? '凭据已保存' : '缺少凭据'}</TerminalStatus></header>
      <dl className="connection-inspector-list">
        <div><dt>连接类型</dt><dd>{driverLabel(selectedConnection.driver)}</dd></div>
        <div><dt>归属范围</dt><dd>{selectedConnection.scope === 'team' ? teams.find((team) => team.id === selectedConnection.teamId)?.name ?? '团队' : '个人'}</dd></div>
        <div className="connection-inspector-endpoint"><dt>连接地址</dt><dd><code>{selectedEndpoint}</code></dd></div>
      </dl>
      <div className="connection-inspector-actions">{selectedConnection.kind === 'database' && <a className="terminal-inline-link" href={`/database?connection=${selectedConnection.id}`}>打开工作台</a>}<TerminalInlineAction tone="info" aria-label="编辑选中连接" onClick={() => openEdit(selectedConnection)}>编辑</TerminalInlineAction><TerminalInlineAction tone="danger" aria-label="删除选中连接" onClick={() => setDeleteTarget(selectedConnection)}>删除</TerminalInlineAction></div>
      <p className="connection-danger-note">危险操作仅作用于当前选择。</p>
    </div>
  ) : null
  useUnifiedContext(connectionContext, {label: '连接详情', deps: [selectedConnection?.id, selectedEndpoint, teams]})
  useUnifiedRuntime({path: ['connections', selectedConnection?.name ?? 'registry'], detail: loading ? '同步中' : `${visible.length} visible`}, [selectedConnection?.id, loading, visible.length])
  useUnifiedStatus(error || success || (loading ? '正在同步连接…' : `READY · ${visible.length} / ${connections.length} CONNECTIONS`), [error, success, loading, visible.length, connections.length])

  return (
    <section className="product-workbench-page connections-page">
      <div className="unified-page-frame">
        <header className="unified-page-toolbar">
          <div className="unified-page-title">
            <h2>Connections</h2>
            <p>共享数据库与 SSH 入口 · {connections.length} endpoints</p>
          </div>
          <span className="unified-page-toolbar-spacer" />
          <TerminalInlineAction tone="success" onClick={() => openCreate()}>新建连接</TerminalInlineAction>
        </header>
        <div className="unified-page-body">
          {(success || error) && <div className="connection-feedback">{success && <p className="form-success" role="status">{success}</p>}{error && <p className="form-error" role="alert">{error}</p>}</div>}
          <div className="connection-workspace-grid">
            <TerminalCommandFilter aria-label="筛选连接" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="名称 / 主机 / 驱动" tokens={[`类型：${kind || '全部'}`, `范围：${scope || '全部'}`]} />
            <div className="connection-table-region">
              {loading ? <div className="workbench-fill-state" role="status">正在加载…</div> : visible.length === 0 ? <div className="workbench-fill-state"><EmptyState title="还没有保存的连接" description="新建连接，或调整资源筛选查看团队入口。" /></div> : (
                <div className="connection-terminal-table-wrap"><table className="connection-terminal-table" aria-label="连接记录">
                <thead><tr><th>NAME / DRIVER</th><th>ENDPOINT</th><th>SCOPE</th><th>STATUS</th></tr></thead>
                <tbody>
                  {visible.map((connection) => (
                    <tr
                      key={connection.id}
                      aria-selected={selectedConnectionId === connection.id}
                      tabIndex={0}
                      onClick={() => setSelectedConnectionId(connection.id)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault()
                          setSelectedConnectionId(connection.id)
                        }
                      }}
                    >
                      <th scope="row"><strong>{connection.name}</strong><small>{driverLabel(connection.driver)}</small></th>
                      <td className="connection-endpoint"><code>{connection.endpoint.host}:{connection.endpoint.port}{connection.config.database ? `/${connection.config.database}` : ''}</code></td>
                      <td>{connection.scope === 'team' ? `团队 ${teams.find((team) => team.id === connection.teamId)?.name ?? connection.teamId}` : '个人'}</td>
                      <td><TerminalStatus tone={connection.hasSecret ? 'success' : 'warning'}>{connection.hasSecret ? 'READY' : 'CREDENTIALS'}</TerminalStatus></td>
                    </tr>
                  ))}
                </tbody>
                </table></div>
              )}
            </div>
          </div>
        </div>
      </div>

      {formMode && (
        <FormDialog
          wide
          title={formMode === 'edit' ? `编辑 ${editing?.name}` : '新建连接'}
          description="凭据只写入服务端加密存储，保存后不会返回明文。"
          submitLabel="保存连接"
          submitting={saving}
          onCancel={() => setFormMode(null)}
          onSubmit={submit}
        >
          <div className="connection-form">
            <div className="segmented">
              <button type="button" data-active={form.kind === 'database'} onClick={() => setFormKind('database')}>数据库</button>
              <button type="button" data-active={form.kind === 'ssh'} onClick={() => setFormKind('ssh')}>SSH</button>
            </div>
            <TextField label="连接名称" value={form.name} error={fieldErrors.name} onChange={(event) => setForm((current) => ({...current, name: event.target.value}))} />
            <div className="field-block"><span>驱动</span><SelectControl ariaLabel="连接驱动" value={form.driver} options={form.kind === 'ssh' ? sshDriverOptions : driverOptions} onChange={(value) => setFormDriver(value as ConnectionDriver)} /></div>
            <div className="field-block"><span>范围</span><SelectControl ariaLabel="连接范围" value={form.scope} options={scopeOptions} onChange={(value) => setFormScope(value as ConnectionScope)} /></div>
            {form.scope === 'team' && <div className="field-block"><span>团队</span><SelectControl ariaLabel="连接团队" value={form.teamId} options={adminTeams.map((team) => ({value: team.id, label: team.name}))} onChange={(teamId) => setForm((current) => ({...current, teamId}))} />{fieldErrors.teamId && <span>{fieldErrors.teamId}</span>}</div>}
            <TextField label="主机" value={form.host} error={fieldErrors.host} onChange={(event) => setForm((current) => ({...current, host: event.target.value}))} />
            <TextField label="端口" inputMode="numeric" value={form.port} error={fieldErrors.port} onChange={(event) => setForm((current) => ({...current, port: event.target.value}))} />
            {form.kind === 'database' && <TextField label="数据库名" value={form.database} onChange={(event) => setForm((current) => ({...current, database: event.target.value}))} />}
            <TextField label="用户名" autoComplete="username" value={form.username} onChange={(event) => setForm((current) => ({...current, username: event.target.value}))} />
            {form.kind === 'database' ? (
              <TextField label="密码" type="password" autoComplete="new-password" value={form.password} placeholder={formMode === 'edit' && editing?.hasSecret ? '留空则保留已保存密码' : ''} hint={formMode === 'edit' && editing?.hasSecret ? '已保存密码；留空则继续保留。' : undefined} onChange={(event) => setForm((current) => ({...current, password: event.target.value}))} />
            ) : (
              <>
                <TextAreaField label="私钥" className="connection-wide-field" value={form.privateKey} placeholder={formMode === 'edit' && editing?.hasSecret ? '留空则保留已保存私钥' : ''} hint={formMode === 'edit' && editing?.hasSecret ? '已保存私钥；留空则继续保留。' : undefined} onChange={(event) => setForm((current) => ({...current, privateKey: event.target.value}))} />
                <TextField label="密钥口令" type="password" autoComplete="new-password" value={form.passphrase} onChange={(event) => setForm((current) => ({...current, passphrase: event.target.value}))} />
              </>
            )}
          </div>
        </FormDialog>
      )}

      {deleteTarget && (
        <ConfirmDialog
          danger
          title={`删除连接 ${deleteTarget.name}？`}
          description="这个操作只删除 Ops Console 中保存的连接记录，不会删除任何外部数据库或服务器。"
          confirmLabel="删除连接"
          onCancel={() => setDeleteTarget(null)}
          onConfirm={() => { void confirmDelete() }}
        />
      )}
    </section>
  )
}
