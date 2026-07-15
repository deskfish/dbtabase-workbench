import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { BrandMark } from '../features/ui/BrandMark'

const nav = [
  {to: '/connections', label: '连接中心', end: false},
  {to: '/database', label: '数据库', end: true},
  {to: '/logs', label: '日志', end: true},
  {to: '/settings', label: '设置', end: false},
]

export function ProductHeader() {
  const {session, logout} = useAuth()
  const navigate = useNavigate()
  const displayName = session?.user.displayName || session?.user.username || '用户'

  async function signOut() {
    await logout()
    navigate('/login', {replace: true})
  }

  return (
    <header className="product-header" aria-label="产品导航">
      <div className="product-header-brand">
        <BrandMark size={32} />
        <div>
          <h1>数据库管理</h1>
          <p>Database Workbench · MySQL / PostgreSQL / MongoDB / Redis</p>
        </div>
      </div>

      <nav className="product-header-nav" aria-label="模块导航">
        {nav.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({isActive}) => `product-nav-link${isActive ? ' active' : ''}`}
          >
            {item.label}
          </NavLink>
        ))}
      </nav>

      <div className="product-header-actions">
        <span className="product-status-pill"><span className="status-dot" aria-hidden="true" />已连接控制平面</span>
        <div className="product-user-chip">
          <b aria-hidden="true">{displayName.slice(0, 1).toUpperCase()}</b>
          <strong>{displayName}</strong>
          <button type="button" className="oc-button compact" onClick={() => void signOut()}>退出</button>
        </div>
      </div>
    </header>
  )
}
