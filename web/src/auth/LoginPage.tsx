import { FormEvent, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from './AuthProvider'

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
        <div className="login-kicker">OPS CONSOLE</div>
        <h1 id="login-heading">登录 Ops Console</h1>
        <p>统一管理数据库连接、工作台和后续日志能力。凭本地账号进入，不在浏览器保存密码。</p>
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
