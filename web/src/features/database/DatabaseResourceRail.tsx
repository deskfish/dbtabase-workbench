import {useMemo, useState, type ReactNode} from 'react'
import {Link} from 'react-router-dom'
import type {ConnectionScope, WorkbenchTarget} from '../../connections/types'
import './database-workbench.css'

const driverLabels: Record<WorkbenchTarget['driver'], string> = {
  postgres: 'PG',
  mysql: 'MY',
  mongodb: 'MO',
  redis: 'RE',
}

export function DatabaseResourceRail({
  connections,
  selectedId,
  connectingId,
  connected,
  loading = false,
  error = '',
  catalog,
  onSelect,
}: {
  connections: WorkbenchTarget[]
  selectedId: string
  connectingId: string
  connected: boolean
  loading?: boolean
  error?: string
  catalog?: ReactNode
  onSelect(connection: WorkbenchTarget): void
}) {
  const [query, setQuery] = useState('')
  const visible = useMemo(() => {
    const value = query.trim().toLowerCase()
    if (!value) return connections
    return connections.filter((connection) => [connection.name, connection.host, connection.database, connection.driver]
      .some((part) => part.toLowerCase().includes(value)))
  }, [connections, query])

  const groups: Array<{scope: ConnectionScope; label: string}> = [
    {scope: 'personal', label: '个人'},
    {scope: 'team', label: '团队'},
  ]

  return <div className="database-resource-rail">
    <header className="database-resource-header">
      <div><span>DATABASES</span><strong>{connections.length}</strong></div>
      <Link to="/connections">管理连接</Link>
    </header>
    <label className="database-resource-search">
      <span aria-hidden="true">⌕</span>
      <input
        type="search"
        aria-label="搜索数据库连接"
        placeholder="名称 / 主机 / 数据库"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
    </label>
    <div className="database-resource-list">
      {loading && <p className="database-resource-message">正在同步连接…</p>}
      {!loading && error && <p className="database-resource-message error">{error}</p>}
      {!loading && connections.length === 0 && <div className="database-resource-empty">
        <span aria-hidden="true">＋</span>
        <strong>还没有数据库连接</strong>
        <p>连接统一在连接中心创建和管理。</p>
        <Link to="/connections">前往连接中心</Link>
      </div>}
      {!loading && connections.length > 0 && visible.length === 0 && <p className="database-resource-message">没有匹配的连接</p>}
      {groups.map((group) => {
        const items = visible.filter((connection) => connection.scope === group.scope)
        if (items.length === 0) return null
        return <section key={group.scope} className="database-resource-group" aria-label={`${group.label}连接`}>
          <h3><span>{group.label}</span><b>{items.length}</b></h3>
          {items.map((connection) => {
            const selected = connection.id === selectedId
            const busy = connection.id === connectingId
            const online = selected && connected && !busy
            return <button
              key={connection.id}
              type="button"
              className={`database-resource-connection${selected ? ' selected' : ''}`}
              aria-label={`连接 ${connection.name}`}
              aria-current={selected ? 'true' : undefined}
              disabled={Boolean(connectingId) && !busy}
              onClick={() => onSelect(connection)}
            >
              <i className={`database-driver-mark ${connection.driver}`} aria-hidden="true">{driverLabels[connection.driver]}</i>
              <span><strong>{connection.name}</strong><small>{connection.host}:{connection.port}{connection.database ? ` / ${connection.database}` : ''}</small></span>
              <em className={online ? 'online' : busy ? 'busy' : ''}>{online ? '在线' : busy ? '连接中' : '○'}</em>
            </button>
          })}
        </section>
      })}
    </div>
    {selectedId && connected && catalog && <div className="database-resource-catalog">{catalog}</div>}
  </div>
}
