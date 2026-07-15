import { FormEvent, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { BrandMark } from '../features/ui/BrandMark'
import { useAuth } from './AuthProvider'
import '../layout/AppShell.css'

export function LoginPage() {
  const {login} = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    setSubmitting(true)
    setError('')
    try {
      await login(username, password)
      const from = (location.state as {from?: {pathname?: string}} | null)?.from?.pathname
      navigate(from && from !== '/login' ? from : '/connections', {replace: true})
    } catch (err) {
      setError(err instanceof Error ? err.message : '登录失败')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="login-page">
      <section className="login-card" aria-labelledby="login-heading">
        <div className="login-brand">
          <BrandMark size={40} />
          <div>
            <h1 id="login-heading">Ops Console</h1>
            <p className="login-subtitle">数据库运维平台 · MySQL / PostgreSQL / MongoDB / Redis</p>
          </div>
        </div>
        <p className="login-copy">使用本地账号登录，统一管理数据库连接、日志与团队设置。</p>
        <form onSubmit={submit}>
          <label>用户名<input autoFocus autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} /></label>
          <label>密码<input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} /></label>
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="oc-button primary" type="submit" disabled={submitting}>{submitting ? '登录中…' : '登录'}</button>
        </form>
      </section>
    </main>
  )
}
