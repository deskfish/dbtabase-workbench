import { useEffect, useState } from 'react'
import type { DriverId } from '../../api/driver'
import { isSqlDriver } from '../../api/driver'
import { ContextMenu, type ContextMenuItem } from '../ui/ContextMenu'
import { Icon } from '../ui/Icon'

export function DatabaseSwitcher({driver, current, databases, busy, onSwitch, onCreateTable, onDeleteDatabase}: {
  driver: DriverId
  current: string
  databases: string[]
  busy: boolean
  onSwitch: (database: string) => void
  onCreateTable: (database: string) => void
  onDeleteDatabase: (database: string) => void
}) {
  const [expanded, setExpanded] = useState(true)
  const [menu, setMenu] = useState<{database: string; x: number; y: number} | null>(null)

  useEffect(() => {
    if (current) setExpanded(true)
  }, [current])

  const menuItems: ContextMenuItem[] = menu && isSqlDriver(driver)
    ? [
      {label: '新建表', action: () => onCreateTable(menu.database)},
      {separator: true},
      {label: '删除库', action: () => onDeleteDatabase(menu.database)},
    ]
    : []

  const subtitle = driver === 'redis'
    ? 'Redis DB 索引 0–15'
    : driver === 'mongodb'
      ? 'MongoDB 实例内切换'
      : driver === 'postgres'
        ? 'PostgreSQL 实例内切换'
        : 'MySQL 实例内切换'

  const panelTitle = driver === 'redis' ? 'DB 索引' : '数据库'

  return <div className="database-panel">
    <div className="panel-heading database-panel-heading">
      <div><span>{panelTitle}</span><small>{subtitle}</small></div>
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
          onContextMenu={(event) => {
            event.preventDefault()
            setMenu({database: name, x: event.clientX, y: event.clientY})
          }}
        >
          <span className="database-icon" aria-hidden="true">{driver === 'redis' ? '#' : '🗄'}</span>
          <span className="database-name">{driver === 'redis' ? `DB ${name}` : name}</span>
          {active && <span className="connection-status online">当前</span>}
        </button>
      })}
    </div>}
    {menu && <ContextMenu x={menu.x} y={menu.y} items={menuItems} onClose={() => setMenu(null)} />}
  </div>
}
