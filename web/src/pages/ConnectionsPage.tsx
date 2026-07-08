import { FormEvent, useEffect, useMemo, useState } from 'react'
import { connectionsClient, type ConnectionsClient } from '../connections/client'
import { ConnectionFormError, defaultDriver, defaultPort, toSaveInput, type ConnectionFormValue } from '../connections/connectionForm'
import type { Connection, ConnectionDriver, ConnectionFilters, ConnectionKind, ConnectionScope } from '../connections/types'
import { useAuth } from '../auth/AuthProvider'
import { SelectControl } from '../features/ui/SelectControl'
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

  return (
    <section className="ops-page connections-page">
      <div className="page-heading-row">
        <div>
          <p className="login-kicker">CONNECTIONS</p>
          <h1>连接中心</h1>
          <p>统一管理个人与团队数据库、SSH 连接记录。密钥只写入服务端加密存储，列表永不返回明文。</p>
        </div>
        <button className="oc-button primary" type="button" onClick={() => openCreate()}>新建连接</button>
      </div>
      {success && <p className="form-success" role="status">{success}</p>}
      {error && <p className="form-error" role="alert">{error}</p>}

      <section className="ops-panel connection-toolbar" aria-label="连接筛选">
        <div className="segmented" aria-label="类型筛选">
          {kindFilters.map((item) => <button key={item.label} type="button" data-active={kind === item.value} onClick={() => setKind(item.value)}>{item.label}</button>)}
        </div>
        <div className="segmented" aria-label="范围筛选">
          {scopeFilters.map((item) => <button key={item.label} type="button" data-active={scope === item.value} onClick={() => setScope(item.value)}>{item.label}</button>)}
        </div>
        <label className="connection-search">搜索<input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="名称、主机或驱动" /></label>
      </section>

      <section className="ops-panel">
        {loading ? <p>正在加载连接…</p> : visible.length === 0 ? <div className="empty-state">暂无连接记录。你可以先新建个人数据库连接，或为团队登记 SSH 入口。</div> : (
          <table className="connections-table">
            <thead><tr><th>名称</th><th>类型</th><th>范围</th><th>主机</th><th>Secret</th><th>操作</th></tr></thead>
            <tbody>
              {visible.map((connection) => (
                <tr key={connection.id}>
                  <th scope="row">{connection.name}</th>
                  <td><span className="badge">{driverLabel(connection.driver)}</span></td>
                  <td>{connection.scope === 'team' ? `团队 ${teams.find((team) => team.id === connection.teamId)?.name ?? connection.teamId}` : '个人'}</td>
                  <td>{connection.endpoint.host}:{connection.endpoint.port}{connection.config.database ? `/${connection.config.database}` : ''}</td>
                  <td>{connection.hasSecret ? '已保存' : '未保存'}</td>
                  <td><div className="row-actions"><button className="oc-button" type="button" onClick={() => openEdit(connection)}>编辑</button><button className="oc-button" type="button" onClick={() => setDeleteTarget(connection)}>删除</button></div></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {formMode && (
        <section className="ops-panel connection-form-panel" aria-label={formMode === 'edit' ? '编辑连接' : '新建连接'}>
          <div className="panel-title-row"><h2>{formMode === 'edit' ? `编辑 ${editing?.name}` : '新建连接'}</h2><button className="oc-button" type="button" onClick={() => setFormMode(null)}>取消</button></div>
          <form className="connection-form" onSubmit={submit}>
            <div className="segmented">
              <button type="button" data-active={form.kind === 'database'} onClick={() => setFormKind('database')}>数据库</button>
              <button type="button" data-active={form.kind === 'ssh'} onClick={() => setFormKind('ssh')}>SSH</button>
            </div>
            <label>连接名称<input value={form.name} onChange={(event) => setForm((current) => ({...current, name: event.target.value}))} />{fieldErrors.name && <span>{fieldErrors.name}</span>}</label>
            <div className="field-block"><span>驱动</span><SelectControl ariaLabel="连接驱动" value={form.driver} options={form.kind === 'ssh' ? sshDriverOptions : driverOptions} onChange={(value) => setFormDriver(value as ConnectionDriver)} /></div>
            <div className="field-block"><span>范围</span><SelectControl ariaLabel="连接范围" value={form.scope} options={scopeOptions} onChange={(value) => setFormScope(value as ConnectionScope)} /></div>
            {form.scope === 'team' && <div className="field-block"><span>团队</span><SelectControl ariaLabel="连接团队" value={form.teamId} options={adminTeams.map((team) => ({value: team.id, label: team.name}))} onChange={(teamId) => setForm((current) => ({...current, teamId}))} />{fieldErrors.teamId && <span>{fieldErrors.teamId}</span>}</div>}
            <label>主机<input value={form.host} onChange={(event) => setForm((current) => ({...current, host: event.target.value}))} />{fieldErrors.host && <span>{fieldErrors.host}</span>}</label>
            <label>端口<input inputMode="numeric" value={form.port} onChange={(event) => setForm((current) => ({...current, port: event.target.value}))} />{fieldErrors.port && <span>{fieldErrors.port}</span>}</label>
            {form.kind === 'database' && <label>数据库名<input value={form.database} onChange={(event) => setForm((current) => ({...current, database: event.target.value}))} /></label>}
            <label>用户名<input autoComplete="username" value={form.username} onChange={(event) => setForm((current) => ({...current, username: event.target.value}))} /></label>
            {form.kind === 'database' ? (
              <label>密码<input aria-label="密码" type="password" autoComplete="new-password" value={form.password} placeholder={formMode === 'edit' && editing?.hasSecret ? '留空则保留已保存密码' : ''} onChange={(event) => setForm((current) => ({...current, password: event.target.value}))} />{formMode === 'edit' && editing?.hasSecret && <small>已保存密码；留空则继续保留。</small>}</label>
            ) : (
              <>
                <label>私钥<textarea aria-label="私钥" value={form.privateKey} placeholder={formMode === 'edit' && editing?.hasSecret ? '留空则保留已保存私钥' : ''} onChange={(event) => setForm((current) => ({...current, privateKey: event.target.value}))} />{formMode === 'edit' && editing?.hasSecret && <small>已保存私钥；留空则继续保留。</small>}</label>
                <label>密钥口令<input type="password" autoComplete="new-password" value={form.passphrase} onChange={(event) => setForm((current) => ({...current, passphrase: event.target.value}))} /></label>
              </>
            )}
            <button className="oc-button primary" type="submit" disabled={saving}>{saving ? '保存中…' : '保存连接'}</button>
          </form>
        </section>
      )}

      {deleteTarget && (
        <section className="ops-panel delete-confirm" aria-label="删除确认">
          <p>确认删除 <strong>{deleteTarget.name}</strong>？这个操作不会删除任何外部数据库或服务器。</p>
          <div className="row-actions"><button className="oc-button" type="button" onClick={() => setDeleteTarget(null)}>取消</button><button className="oc-button primary" type="button" onClick={confirmDelete}>确认删除</button></div>
        </section>
      )}
    </section>
  )
}
