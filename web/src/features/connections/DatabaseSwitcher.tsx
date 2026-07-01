import { useEffect, useState } from 'react'
import { Icon } from '../ui/Icon'

export function DatabaseSwitcher({driver, current, databases, busy, onSwitch}: {
  driver: 'mysql' | 'postgres'
  current: string
  databases: string[]
  busy: boolean
  onSwitch: (database: string) => void
}) {
  const [expanded, setExpanded] = useState(true)

  useEffect(() => {
    if (current) setExpanded(true)
  }, [current])

  return <div className="database-panel">
    <div className="panel-heading database-panel-heading">
      <div><span>数据库</span><small>{driver === 'postgres' ? 'PostgreSQL 实例内切换' : 'MySQL 实例内切换'}</small></div>
      <button type="button" className="icon-button" aria-label={expanded ? '收起数据库列表' : '展开数据库列表'} onClick={() => setExpanded((value) => !value)}><Icon name={expanded ? 'chevron-down' : 'chevron-right'} /></button>
    </div>
    {expanded && <div className="database-list" role="listbox" aria-label="数据库列表">
      {databases.length === 0 && <div className="empty-state compact">正在加载数据库列表…</div>}
      {databases.map((name) => {
        const active = name === current
        return <button
          key={name}
          type="button"
          role="option"
          aria-selected={active}
          className={`database-item ${active ? 'active' : ''}`}
          disabled={busy || active}
          onClick={() => onSwitch(name)}
        >
          <span className="database-icon" aria-hidden="true">🗄</span>
          <span className="database-name">{name}</span>
          {active && <span className="connection-status online">当前</span>}
        </button>
      })}
    </div>}
  </div>
}
