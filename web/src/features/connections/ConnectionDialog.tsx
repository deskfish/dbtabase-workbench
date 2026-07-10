import { useState, type FormEvent } from 'react'
import type { ConnectionInput } from '../../api/types'
import type { DriverId } from '../../api/driver'
import type { SavedConnection } from '../../storage/connections'
import { Checkbox } from '../ui/Checkbox'
import { SelectControl } from '../ui/SelectControl'
import { driverDefaults, driverFormSpec, normalizeConnectionInput, validateConnectionInput } from './connectionFields'

export type ConnectionOptions = {name: string; save: boolean}

export function ConnectionDialog({saved, sessionState = 'ready', onRetrySession, onCancel, onConnect}: {
  saved?: SavedConnection
  sessionState?: 'loading'|'ready'|'error'
  onRetrySession?: () => void
  onCancel: () => void
  onConnect: (input: ConnectionInput, options: ConnectionOptions) => Promise<void>
}) {
  const editing = Boolean(saved)
  const [driver, setDriver] = useState<DriverId>(saved?.driver ?? 'mysql')
  const [name, setName] = useState(saved?.name ?? '')
  const [host, setHost] = useState(saved?.host ?? '')
  const [port, setPort] = useState(saved?.port ?? driverDefaults('mysql').port)
  const [database, setDatabase] = useState(saved?.database ?? '')
  const [user, setUser] = useState(saved?.user ?? '')
  const [password, setPassword] = useState(saved?.password ?? '')
  const [tlsMode, setTLSMode] = useState(saved?.tlsMode ?? driverDefaults('mysql').tlsMode)
  const [save, setSave] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const driverOptions = [
    {value: 'mysql', label: 'MySQL'},
    {value: 'postgres', label: 'PostgreSQL'},
    {value: 'mongodb', label: 'MongoDB'},
    {value: 'redis', label: 'Redis'},
  ] as const

  const form = driverFormSpec(driver)

  function applyDriverDefaults(next: DriverId) {
    const defaults = driverDefaults(next)
    setDriver(next)
    setPort(defaults.port)
    setTLSMode(defaults.tlsMode)
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    setError('')
    const draft = {driver, host, port, database, user, password, tlsMode}
    const validationError = validateConnectionInput(draft)
    if (validationError) {
      setError(validationError)
      return
    }
    setBusy(true)
    try {
      await onConnect(normalizeConnectionInput(draft), {name: name.trim(), save})
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '连接失败')
      setBusy(false)
    }
  }

  return <div className="dialog-backdrop">
    <form role="dialog" aria-modal="true" aria-label={editing ? '编辑连接' : '新建连接'} className="dialog connection-dialog" onSubmit={submit}>
      <span className="dialog-kicker">{editing ? '编辑连接' : '数据库连接'}</span>
      <h2>{editing ? `编辑 ${saved?.name}` : '新建数据库连接'}</h2>
      <div className="form-grid">
        <label className="wide">连接名称<input aria-label="连接名称" required value={name} onChange={(e)=>setName(e.target.value)} /></label>
        <label>数据库类型<SelectControl ariaLabel="数据库类型" value={driver} options={[...driverOptions]} onChange={(next)=>applyDriverDefaults(next as DriverId)}/></label>
        <label>端口<input aria-label="端口" type="number" min={1} max={65535} required value={port} onChange={(e)=>setPort(Number(e.target.value))} /></label>
        <label className="wide">主机<input aria-label="主机" required value={host} onChange={(e)=>setHost(e.target.value)} placeholder="10.10.20.15" /></label>
        {form.database.visible && <label>{form.database.label}<input aria-label={form.database.label} value={database} onChange={(e)=>setDatabase(e.target.value)} placeholder={form.database.placeholder} /></label>}
        {form.user.visible && <label>{form.user.label}<input aria-label={form.user.label} value={user} onChange={(e)=>setUser(e.target.value)} placeholder={form.user.placeholder} /></label>}
        {form.password.visible && <label className="wide">{form.password.label}<input aria-label={form.password.label} type="password" value={password} onChange={(e)=>setPassword(e.target.value)} autoComplete="off" placeholder={form.password.placeholder} /></label>}
        <label className="wide">TLS 模式<SelectControl ariaLabel="TLS 模式" value={tlsMode} options={form.tlsOptions} onChange={setTLSMode}/></label>
        <Checkbox className="wide checkbox" label="保存到左侧连接列表" checked={save} onChange={(e)=>setSave(e.target.checked)} />
      </div>
      {sessionState === 'error' && <p className="form-error" role="alert">会话初始化失败，请点击「重试会话」。</p>}
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="dialog-actions">
        <button type="button" className="button ghost" onClick={onCancel}>取消</button>
        {sessionState === 'error' && onRetrySession && <button type="button" className="button ghost" onClick={onRetrySession}>重试会话</button>}
        <button type="submit" className="button primary" disabled={busy || sessionState !== 'ready'}>{busy ? '正在连接…' : sessionState === 'loading' ? '正在初始化会话…' : sessionState === 'error' ? '会话未就绪' : editing ? '保存并连接' : '连接数据库'}</button>
      </div>
    </form>
  </div>
}
