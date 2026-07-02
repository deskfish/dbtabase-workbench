import { useState, type FormEvent } from 'react'
import type { ConnectionInput } from '../../api/types'
import type { SavedConnection } from '../../storage/connections'
import { SelectControl } from '../ui/SelectControl'

export type ConnectionOptions = {name: string; save: boolean}

export function ConnectionDialog({saved, sessionState = 'ready', onRetrySession, onCancel, onConnect}: {
  saved?: SavedConnection
  sessionState?: 'loading'|'ready'|'error'
  onRetrySession?: () => void
  onCancel: () => void
  onConnect: (input: ConnectionInput, options: ConnectionOptions) => Promise<void>
}) {
  const editing = Boolean(saved)
  const [driver, setDriver] = useState<'mysql'|'postgres'>(saved?.driver ?? 'mysql')
  const [name, setName] = useState(saved?.name ?? '')
  const [host, setHost] = useState(saved?.host ?? '')
  const [port, setPort] = useState(saved?.port ?? 3306)
  const [database, setDatabase] = useState(saved?.database ?? '')
  const [user, setUser] = useState(saved?.user ?? '')
  const [password, setPassword] = useState(saved?.password ?? '')
  const [tlsMode, setTLSMode] = useState(saved?.tlsMode ?? 'disabled')
  const [save, setSave] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError('')
    try {
      const input = {driver, host, port, database, user, password, tlsMode}
      await onConnect(input, {name, save})
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
        <label>数据库类型<SelectControl ariaLabel="数据库类型" value={driver} options={[{value:'mysql',label:'MySQL'},{value:'postgres',label:'PostgreSQL'}]} onChange={(next)=>{const value=next as 'mysql'|'postgres'; setDriver(value); setPort(value === 'mysql' ? 3306 : 5432); setTLSMode(value === 'mysql' ? 'disabled' : 'prefer')}}/></label>
        <label>端口<input aria-label="端口" type="number" required value={port} onChange={(e)=>setPort(Number(e.target.value))} /></label>
        <label className="wide">主机<input aria-label="主机" required value={host} onChange={(e)=>setHost(e.target.value)} placeholder="10.10.20.15" /></label>
        <label>数据库<input aria-label="数据库" value={database} onChange={(e)=>setDatabase(e.target.value)} placeholder={driver === 'postgres' ? '留空默认 postgres，连接后可切换' : '数据库名'} /></label>
        <label>用户名<input aria-label="用户名" required value={user} onChange={(e)=>setUser(e.target.value)} /></label>
        <label className="wide">数据库密码<input aria-label="数据库密码" type="password" required value={password} onChange={(e)=>setPassword(e.target.value)} autoComplete="off" /></label>
        <label className="wide">TLS 模式<SelectControl ariaLabel="TLS 模式" value={tlsMode} options={driver === 'mysql' ? [{value:'disabled',label:'关闭'},{value:'preferred',label:'优先'},{value:'required',label:'必须'}] : [{value:'disable',label:'关闭'},{value:'prefer',label:'优先'},{value:'require',label:'必须'},{value:'verify-full',label:'完整验证'}]} onChange={setTLSMode}/></label>
        <label className="wide checkbox"><input type="checkbox" checked={save} onChange={(e)=>setSave(e.target.checked)} />保存到左侧连接列表</label>
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
