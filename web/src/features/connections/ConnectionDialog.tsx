import { useState, type FormEvent } from 'react'
import type { ConnectionInput } from '../../api/types'
import type { SavedConnection } from '../../storage/connections'

export type ConnectionOptions = {name:string; save:boolean; unlockPassword:string}

export function ConnectionDialog({saved, onCancel, onConnect}: {
  saved?: SavedConnection
  onCancel:()=>void
  onConnect:(input:ConnectionInput | null, options:ConnectionOptions)=>Promise<void>
}) {
  const [driver, setDriver] = useState<'mysql'|'postgres'>(saved?.driver ?? 'mysql')
  const [name, setName] = useState(saved?.name ?? '')
  const [host, setHost] = useState(saved?.host ?? '')
  const [port, setPort] = useState(saved?.port ?? 3306)
  const [database, setDatabase] = useState(saved?.database ?? '')
  const [user, setUser] = useState(saved?.user ?? '')
  const [password, setPassword] = useState('')
  const [tlsMode, setTLSMode] = useState(saved?.tlsMode ?? 'disabled')
  const [save, setSave] = useState(Boolean(saved))
  const [unlockPassword, setUnlockPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError('')
    try {
      const input = saved ? null : {driver, host, port, database, user, password, tlsMode}
      await onConnect(input, {name, save, unlockPassword})
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '连接失败')
      setBusy(false)
    }
  }

  return <div className="dialog-backdrop">
    <form role="dialog" aria-modal="true" aria-label={saved ? '解锁连接' : '新建连接'} className="dialog connection-dialog" onSubmit={submit}>
      <span className="dialog-kicker">{saved ? '本地已保存' : '数据库连接'}</span>
      <h2>{saved ? `连接到 ${saved.name}` : '新建数据库连接'}</h2>
      {!saved && <div className="form-grid">
        <label className="wide">连接名称<input aria-label="连接名称" required value={name} onChange={(e)=>setName(e.target.value)} /></label>
        <label>数据库类型<select value={driver} onChange={(e)=>{const value=e.target.value as 'mysql'|'postgres'; setDriver(value); setPort(value === 'mysql' ? 3306 : 5432); setTLSMode(value === 'mysql' ? 'disabled' : 'prefer')}}><option value="mysql">MySQL</option><option value="postgres">PostgreSQL</option></select></label>
        <label>端口<input aria-label="端口" type="number" required value={port} onChange={(e)=>setPort(Number(e.target.value))} /></label>
        <label className="wide">主机<input aria-label="主机" required value={host} onChange={(e)=>setHost(e.target.value)} placeholder="10.10.20.15" /></label>
        <label>数据库<input aria-label="数据库" value={database} onChange={(e)=>setDatabase(e.target.value)} /></label>
        <label>用户名<input aria-label="用户名" required value={user} onChange={(e)=>setUser(e.target.value)} /></label>
        <label className="wide">数据库密码<input aria-label="数据库密码" type="password" required value={password} onChange={(e)=>setPassword(e.target.value)} autoComplete="off" /></label>
        <label className="wide">TLS 模式<select value={tlsMode} onChange={(e)=>setTLSMode(e.target.value)}>{driver === 'mysql' ? <><option value="disabled">关闭</option><option value="preferred">优先</option><option value="required">必须</option></> : <><option value="disable">关闭</option><option value="prefer">优先</option><option value="require">必须</option><option value="verify-full">完整验证</option></>}</select></label>
        <label className="wide checkbox"><input type="checkbox" checked={save} onChange={(e)=>setSave(e.target.checked)} />加密保存在此浏览器</label>
      </div>}
      {(save || saved) && <label>本地解锁密码<input aria-label="本地解锁密码" type="password" required value={unlockPassword} onChange={(e)=>setUnlockPassword(e.target.value)} autoComplete="off" /><small>只用于本机加密，无法找回</small></label>}
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="dialog-actions"><button type="button" className="button ghost" onClick={onCancel}>取消</button><button type="submit" className="button primary" disabled={busy}>{busy ? '正在连接…' : '连接数据库'}</button></div>
    </form>
  </div>
}
