import { useAuth } from '../auth/AuthProvider'

export function SettingsPage() {
  const {session} = useAuth()
  return (
    <section className="ops-page">
      <p className="login-kicker">SETTINGS</p>
      <h1>设置</h1>
      <p>当前账号与团队上下文。用户和团队管理会在下一步扩展。</p>
      <div className="ops-panel">
        <strong>{session?.user.displayName || session?.user.username}</strong>
        <p>系统角色：{session?.user.systemRole}</p>
        <p>团队数量：{session?.teams.length ?? 0}</p>
      </div>
    </section>
  )
}
