import {useEffect, useMemo, useRef, useState} from 'react'
import {useLocation, useNavigate} from 'react-router-dom'
import {Icon} from '../features/ui/Icon'
import {useUnifiedShell} from './UnifiedShellContext'

const routeLabels: Record<string, string> = {
  '/connections': '连接中心',
  '/database': '数据库',
  '/logs': '日志',
  '/settings': '设置',
  '/settings/profile': '个人资料',
  '/settings/teams': '团队',
  '/settings/users': '用户',
}

const commands = [
  {label: '连接中心', to: '/connections', keywords: '连接 新建 connection'},
  {label: '数据库', to: '/database', keywords: '数据库 查询 sql table'},
  {label: '日志', to: '/logs', keywords: '日志 log 搜索'},
  {label: '设置', to: '/settings/profile', keywords: '设置 用户 团队 profile'},
]

function breadcrumb(pathname: string): string[] {
  if (pathname.startsWith('/settings/')) {
    return ['设置', routeLabels[pathname] ?? '设置']
  }
  const root = `/${pathname.split('/').filter(Boolean)[0] ?? ''}`
  const label = routeLabels[root] ?? routeLabels[pathname]
  return label ? [label] : ['Ops Console']
}

export function CommandBar() {
  const location = useLocation()
  const navigate = useNavigate()
  const {commandExtras} = useUnifiedShell()
  const searchRef = useRef<HTMLInputElement>(null)
  const [query, setQuery] = useState('')
  const [announcement, setAnnouncement] = useState('')
  const crumbs = breadcrumb(location.pathname)
  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return []
    return commands.filter((command) => `${command.label} ${command.keywords}`.toLowerCase().includes(needle))
  }, [query])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        searchRef.current?.focus()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  function runCommand(label: string, to: string) {
    navigate(to)
    setQuery('')
    setAnnouncement(`已打开 ${label}`)
  }

  return (
    <div className="unified-command-bar" role="search" aria-label="命令搜索">
      <div className="unified-command-search-wrap">
      <div className="unified-command-search">
        <Icon name="search" />
        <input
          ref={searchRef}
          type="search"
          aria-label="搜索连接、表或命令"
          aria-keyshortcuts="Meta+K Control+K"
          placeholder="搜索连接、表或命令…"
          data-unified-command-search
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <kbd className="unified-command-kbd" aria-hidden="true">⌘K</kbd>
      </div>
      {matches.length > 0 && <div className="unified-command-menu" role="group" aria-label="命令结果">
        {matches.map((command) => <button key={command.to} type="button" aria-label={`前往 ${command.label}`} onClick={() => runCommand(command.label, command.to)}><span>{command.label}</span><small>前往</small></button>)}
      </div>}
      {query.trim() && matches.length === 0 && <p className="unified-command-empty" role="status">未找到可执行命令</p>}
      </div>
      <nav className="unified-breadcrumb" aria-label="当前位置">
        {crumbs.map((crumb, index) => (
          <span key={`${crumb}-${index}`}>
            {index > 0 && <span className="unified-breadcrumb-sep" aria-hidden="true">/</span>}
            <span className={index === crumbs.length - 1 ? 'current' : ''}>{crumb}</span>
          </span>
        ))}
      </nav>
      {commandExtras && <div className="unified-command-extras">{commandExtras}</div>}
      {announcement && <span className="sr-only" role="status" aria-label={`已导航到 ${announcement.slice(3)}`}>{announcement}</span>}
    </div>
  )
}
