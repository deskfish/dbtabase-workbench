import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { LoginPage } from '../auth/LoginPage'
import { AppShell } from '../layout/AppShell'
import { ConnectionsPage } from '../pages/ConnectionsPage'
import { DatabasePage } from '../pages/DatabasePage'
import { LogsPendingPage } from '../pages/LogsPendingPage'
import { SettingsPage } from '../pages/SettingsPage'

function RequireAuth() {
  const {status, reload} = useAuth()
  const location = useLocation()
  if (status === 'loading') return <main className="login-page"><p>正在检查登录状态…</p></main>
  if (status === 'error') return <main className="login-page"><section className="login-card"><h1>认证状态加载失败</h1><button className="oc-button primary" onClick={() => void reload()}>重试</button></section></main>
  if (status === 'guest') return <Navigate to="/login" replace state={{from: location}} />
  return <AppShell />
}

export function AppRouter() {
  const {status} = useAuth()
  return (
    <Routes>
      <Route path="/login" element={status === 'ready' ? <Navigate to="/connections" replace /> : <LoginPage />} />
      <Route element={<RequireAuth />}>
        <Route index element={<Navigate to="/connections" replace />} />
        <Route path="/connections" element={<ConnectionsPage />} />
        <Route path="/database" element={<DatabasePage />} />
        <Route path="/logs" element={<LogsPendingPage />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
