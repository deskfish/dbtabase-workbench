import { FormEvent, useEffect, useMemo, useState } from 'react'
import { connectionsClient, type ConnectionsClient } from '../connections/client'
import { ConnectionFormError, defaultDriver, defaultPort, toSaveInput, type ConnectionFormValue } from '../connections/connectionForm'
import type { Connection, ConnectionDriver, ConnectionFilters, ConnectionKind, ConnectionScope } from '../connections/types'
import { useAuth } from '../auth/AuthProvider'
import {ConfirmDialog} from '../features/ui/ConfirmDialog'
import {DataGrid} from '../features/ui/DataGrid'
import {EmptyState} from '../features/ui/EmptyState'
import {FormDialog} from '../features/ui/FormDialog'
import { SelectControl } from '../features/ui/SelectControl'
import {StatusBadge} from '../features/ui/StatusBadge'
import {TextAreaField} from '../features/ui/TextAreaField'
import {TextField} from '../features/ui/TextField'
import {WorkbenchContent, WorkbenchFrame, WorkbenchSidebar, WorkbenchToolbar} from '../features/ui/WorkbenchFrame'
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
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const adminTeams = useMemo(() => teams.filter((team) => team.role === 'admin'), [teams])
  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return connections
    return connections.filter((connection) => [connection.name, connection.driver, connection.endpoint.host, connection.config.database].some((value) => String(value ?? '').toLowerCase().includes(needle)))
  }, [connections, query])

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

  const selectedConnection = connections.find((connection) => connection.id === selectedConnectionId) ?? null

  return (
    <section className="ops-workbench-page connections-page">
      <WorkbenchFrame sidebarOpen={sidebarOpen} onSidebarOpenChange={setSidebarOpen}>
        <WorkbenchToolbar title="连接中心" subtitle={`${visible.length} / ${connections.length} 个连接`} onOpenSidebar={() => setSidebarOpen(true)}>
          <button className="oc-button" type="button" aria-label="编辑选中连接" disabled={!selectedConnection} onClick={() => selectedConnection && openEdit(selectedConnection)}>编辑</button>
          <button className="oc-button danger" type="button" aria-label="删除选中连接" disabled={!selectedConnection} onClick={() => selectedConnection && setDeleteTarget(selectedConnection)}>删除</button>
          <button className="oc-button primary" type="button" onClick={() => openCreate()}>新建连接</button>
        </WorkbenchToolbar>

        <WorkbenchSidebar label="连接筛选" footer={<button className="oc-button primary connection-sidebar-create" aria-label="从侧栏新建连接" type="button" onClick={() => openCreate()}>新建连接</button>}>
          <div className="connection-sidebar-section">
            <span className="connection-sidebar-label">类型</span>
            <div className="segmented" aria-label="类型筛选">
              {kindFilters.map((item) => <button key={item.label} type="button" data-active={kind === item.value} onClick={() => setKind(item.value)}>{item.label}</button>)}
            </div>
          </div>
          <div className="connection-sidebar-section">
            <span className="connection-sidebar-label">范围</span>
            <div className="segmented" aria-label="范围筛选">
              {scopeFilters.map((item) => <button key={item.label} type="button" data-active={scope === item.value} onClick={() => setScope(item.value)}>{item.label}</button>)}
            </div>
          </div>
          <div className="connection-sidebar-section"><TextField label="搜索" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="名称、主机或驱动" /></div>
          <div className="connection-stats" aria-label="连接统计">
            <div><strong>{connections.filter((item) => item.kind === 'database').length}</strong><span>数据库</span></div>
            <div><strong>{connections.filter((item) => item.kind === 'ssh').length}</strong><span>SSH</span></div>
          </div>
        </WorkbenchSidebar>

        <WorkbenchContent label="连接列表">
          {(success || error) && <div className="connection-feedback">{success && <p className="form-success" role="status">{success}</p>}{error && <p className="form-error" role="alert">{error}</p>}</div>}
          <DataGrid
            label="连接记录"
            loading={loading}
            empty={visible.length === 0 ? <EmptyState title="暂无连接" description="调整筛选条件，或者创建数据库与 SSH 连接。" action={<button className="oc-button primary" type="button" onClick={() => openCreate()}>新建连接</button>} /> : undefined}
          >
            <thead><tr><th>名称</th><th>类型</th><th>范围</th><th>主机</th><th>凭据</th></tr></thead>
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
                  <th scope="row">{connection.name}</th>
                  <td><StatusBadge tone="info">{driverLabel(connection.driver)}</StatusBadge></td>
                  <td>{connection.scope === 'team' ? `团队 ${teams.find((team) => team.id === connection.teamId)?.name ?? connection.teamId}` : '个人'}</td>
                  <td className="connection-endpoint"><code>{connection.endpoint.host}:{connection.endpoint.port}{connection.config.database ? `/${connection.config.database}` : ''}</code></td>
                  <td><StatusBadge tone={connection.hasSecret ? 'success' : 'warning'}>{connection.hasSecret ? '已保存' : '未保存'}</StatusBadge></td>
                </tr>
              ))}
            </tbody>
          </DataGrid>
        </WorkbenchContent>
      </WorkbenchFrame>

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
