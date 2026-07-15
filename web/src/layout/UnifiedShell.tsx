import {useEffect, useRef, useState, type ReactNode} from 'react'
import {NavLink, useLocation, useNavigate} from 'react-router-dom'
import {useAuth} from '../auth/AuthProvider'
import {BrandMark} from '../features/ui/BrandMark'
import {CommandBar} from './CommandBar'
import {UnifiedShellProvider, useUnifiedShell} from './UnifiedShellContext'
import './unified-shell.css'

const modules = [
  {to: '/connections', label: '连接中心', glyph: '⌁'},
  {to: '/database', label: '数据库', glyph: '▱', end: true},
  {to: '/logs', label: '日志', glyph: '≡', end: true},
  {to: '/settings', label: '设置', glyph: '⚙'},
]
const settings = [{to: '/settings/profile', label: '个人资料'}, {to: '/settings/teams', label: '团队'}, {to: '/settings/users', label: '用户'}]

function ResourceNavigation({close}: {close?: () => void}) {
  const {session, logout} = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const {sidebar} = useUnifiedShell()
  const admin = session?.user.systemRole === 'admin'
  const teamAdmin = (session?.teams ?? []).some((team) => team.role === 'admin')
  const name = session?.user.displayName || session?.user.username || '用户'
  async function signOut() { await logout(); navigate('/login', {replace: true}) }
  return <>
    <div className="terminal-resource-heading"><span>RESOURCES</span><small>工作区</small></div>
    <div className="terminal-module-list" role="navigation" aria-label="模块">
      {modules.map((item) => <NavLink key={item.to} to={item.to} end={item.end} onClick={close} className={({isActive}) => `terminal-module${isActive ? ' active' : ''}`}><i aria-hidden="true">{item.glyph}</i><span>{item.label}</span></NavLink>)}
    </div>
    {location.pathname.startsWith('/settings') && <nav className="terminal-settings-list" aria-label="设置">
      {settings.map((item) => {
        if (item.to.endsWith('/users') && !admin) return null
        if (item.to.endsWith('/teams') && !admin && !teamAdmin) return null
        return <NavLink key={item.to} to={item.to} onClick={close}>{item.label}</NavLink>
      })}
    </nav>}
    {sidebar?.content && <div className="terminal-resource-content" aria-label={sidebar.label ?? '资源内容'}>{sidebar.content}</div>}
    {sidebar?.footer && <footer className="terminal-resource-footer">{sidebar.footer}</footer>}
    <div className="terminal-account"><b>{name.slice(0, 1).toUpperCase()}</b><span><strong>{name}</strong><small>控制平面已连接</small></span><button type="button" onClick={() => void signOut()}>退出</button></div>
  </>
}

function Drawer({kind, open, onClose, triggerRef, children}: {kind: '产品导航' | '上下文'; open: boolean; onClose(): void; triggerRef: React.RefObject<HTMLButtonElement | null>; children: ReactNode}) {
  useEffect(() => {
    if (!open) return
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') { onClose(); requestAnimationFrame(() => triggerRef.current?.focus()) } }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [open, onClose, triggerRef])
  if (!open) return null
  return <div className="terminal-drawer" role="dialog" aria-modal="true" aria-label={kind}>
    <button className="terminal-drawer-scrim" aria-label={`关闭${kind}`} onClick={() => { onClose(); requestAnimationFrame(() => triggerRef.current?.focus()) }} />
    <section className="terminal-drawer-panel"><header><strong>{kind}</strong><button type="button" onClick={onClose}>关闭</button></header>{children}</section>
  </div>
}

function UnifiedShellFrame({children}: {children: ReactNode}) {
  const location = useLocation()
  const {contextRail, runtime, status} = useUnifiedShell()
  const [resourceOpen, setResourceOpen] = useState(false)
  const [contextOpen, setContextOpen] = useState(false)
  const resourceTrigger = useRef<HTMLButtonElement>(null)
  const contextTrigger = useRef<HTMLButtonElement>(null)
  useEffect(() => { setResourceOpen(false); setContextOpen(false) }, [location.pathname])
  const path = runtime?.path?.length ? runtime.path : ['ops-console', location.pathname.split('/')[1] || 'home']
  const context = contextRail?.content ?? <div className="terminal-context-empty"><span>NO SELECTION</span><p>选择资源后，这里会显示运行信息、权限和可用操作。</p></div>
  return <div className="unified-shell">
    <a className="skip-link" href="#main-content">跳到主内容</a>
    <header className="terminal-runtime-bar">
      <div className="terminal-brand"><BrandMark size={24}/><strong>OPS</strong></div>
      <button ref={resourceTrigger} className="terminal-mobile-trigger" aria-label="打开导航" aria-expanded={resourceOpen} onClick={() => setResourceOpen(true)}>资源</button>
      <div className="terminal-path"><span className="terminal-health-dot"/><code>{path.join(' / ')}</code>{runtime?.detail && <small>{runtime.detail}</small>}</div>
      <CommandBar />
      <button ref={contextTrigger} className="terminal-mobile-trigger" aria-label="打开上下文" aria-expanded={contextOpen} onClick={() => setContextOpen(true)}>上下文</button>
    </header>
    <nav className="terminal-resource-rail" aria-label="资源"><ResourceNavigation /></nav>
    <main id="main-content" className="unified-content" tabIndex={-1}>{children}</main>
    <aside className="terminal-context-rail" aria-label={contextRail?.label ?? '上下文'}><div className="terminal-context-heading"><span>CONTEXT</span><small>当前选择</small></div><div className="terminal-context-content">{context}</div>{contextRail?.footer && <footer>{contextRail.footer}</footer>}</aside>
    <div className="terminal-status-line" role="status" aria-live="polite"><span className="terminal-health-dot"/>{status ?? 'READY'}<code>UTF-8 · CN</code></div>
    <div className="terminal-mobile-dock"><button onClick={() => setResourceOpen(true)}>资源</button><NavLink to="/database">工作台</NavLink><button onClick={() => setContextOpen(true)}>上下文</button></div>
    <Drawer kind="产品导航" open={resourceOpen} onClose={() => setResourceOpen(false)} triggerRef={resourceTrigger}><ResourceNavigation close={() => setResourceOpen(false)} /></Drawer>
    <Drawer kind="上下文" open={contextOpen} onClose={() => setContextOpen(false)} triggerRef={contextTrigger}>{context}</Drawer>
  </div>
}

export function UnifiedShell({children}: {children: ReactNode}) { return <UnifiedShellProvider><UnifiedShellFrame>{children}</UnifiedShellFrame></UnifiedShellProvider> }
