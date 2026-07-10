import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import './AppShell.css'

const nav = [
  {to: '/connections', label: '连接中心'},
  {to: '/database', label: '数据库'},
  {to: '/logs', label: '日志'},
  {to: '/settings', label: '设置'},
]

export function AppShell() {
  const {session, logout} = useAuth()
  const navigate = useNavigate()
  const displayName = session?.user.displayName || session?.user.username || '用户'

  async function signOut() {
    await logout()
    navigate('/login', {replace: true})
  }

  return (
    <div className="ops-shell">
      <a className="skip-link" href="#main-content">跳到主内容</a>
      <aside className="ops-rail" aria-label="主导航">
        <div className="ops-brand"><span>OC</span><div><strong>Ops Console</strong><small>Unified workbench</small></div></div>
        <nav>
          {nav.map((item) => <NavLink key={item.to} to={item.to}>{item.label}</NavLink>)}
        </nav>
      </aside>
      <header className="ops-topbar">
        <div><span className="status-dot" /> 已连接控制平面</div>
        <div className="account-chip"><span>{displayName.slice(0, 1).toUpperCase()}</span><strong>{displayName}</strong><button type="button" onClick={signOut}>退出</button></div>
      </header>
      <div id="main-content" className="ops-main" tabIndex={-1}><Outlet /></div>
    </div>
  )
}
