import { useState } from 'react'
import type { DatabaseObject } from '../../api/types'
import { ContextMenu, type ContextMenuItem } from '../ui/ContextMenu'
import { qualifiedTableName, tableKey } from '../workspace/types'
import { Icon } from '../ui/Icon'

type TreeMenu =
  | {kind: 'table'; table: DatabaseObject; x: number; y: number}
  | {kind: 'column'; table: DatabaseObject; column: DatabaseObject; x: number; y: number}

export function ObjectTree({
  objects,
  selectedTableKey = '',
  onOpenTable,
  onNewQueryFromTable,
  onCopyTableName,
  onRefreshTable,
  onCopyColumnName,
  onNewQueryFromColumn,
}: {
  objects: DatabaseObject[]
  selectedTableKey?: string
  onOpenTable?: (table: DatabaseObject) => void
  onNewQueryFromTable?: (table: DatabaseObject) => void
  onCopyTableName?: (table: DatabaseObject) => void
  onRefreshTable?: (table: DatabaseObject) => void
  onCopyColumnName?: (table: DatabaseObject, column: DatabaseObject) => void
  onNewQueryFromColumn?: (table: DatabaseObject, column: DatabaseObject) => void
}) {
  const tables = objects.filter((object) => object.kind === 'table')
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [menu, setMenu] = useState<TreeMenu | null>(null)

  if (tables.length === 0) return <div className="empty-state compact">连接后在这里浏览表</div>

  const menuItems: ContextMenuItem[] = menu?.kind === 'table'
    ? [
      {label: '打开表', action: () => onOpenTable?.(menu.table)},
      {separator: true},
      {label: '新建查询', action: () => onNewQueryFromTable?.(menu.table)},
      {separator: true},
      {label: '复制表名', action: () => onCopyTableName?.(menu.table)},
      {label: '刷新', action: () => onRefreshTable?.(menu.table)},
    ]
    : menu?.kind === 'column'
      ? [
        {label: '复制字段名', action: () => onCopyColumnName?.(menu.table, menu.column)},
        {label: '按字段新建查询', action: () => onNewQueryFromColumn?.(menu.table, menu.column)},
      ]
      : []

  return <>
    <div role="tree" aria-label="数据库对象" className="object-tree">
      {tables.map((table) => {
        const key = tableKey(table)
        const columns = objects.filter((object) => object.kind === 'column' && object.schema === table.schema && object.parent === table.name)
        const isExpanded = expanded[key] ?? false
        const isSelected = selectedTableKey === key
        return <div key={key} className={`tree-table-block ${isSelected ? 'selected' : ''}`}>
          <div className="tree-table-row">
            <button
              type="button"
              className="tree-expand"
              aria-label={isExpanded ? `收起 ${table.name} 字段` : `展开 ${table.name} 字段`}
              aria-expanded={isExpanded}
              onClick={() => setExpanded((state) => ({...state, [key]: !isExpanded}))}
            >
              <Icon name={isExpanded ? 'chevron-down' : 'chevron-right'} />
            </button>
            <button
              type="button"
              role="treeitem"
              className="tree-table-button"
              aria-current={isSelected ? 'true' : undefined}
              onClick={() => onOpenTable?.(table)}
              onContextMenu={(event) => {
                event.preventDefault()
                setMenu({kind: 'table', table, x: event.clientX, y: event.clientY})
              }}
            >
              <span className="tree-icon" aria-hidden="true">▦</span>
              <span>{qualifiedTableName(table)}</span>
            </button>
          </div>
          {isExpanded && <div role="group" className="tree-columns">
            {columns.map((column) => <button
              type="button"
              role="treeitem"
              key={column.name}
              className="tree-column"
              onContextMenu={(event) => {
                event.preventDefault()
                setMenu({kind: 'column', table, column, x: event.clientX, y: event.clientY})
              }}
            >
              <span className="column-name">{column.name}</span>
              <span className="column-type">{column.dataType}</span>
            </button>)}
          </div>}
        </div>
      })}
    </div>
    {menu && <ContextMenu x={menu.x} y={menu.y} items={menuItems} onClose={() => setMenu(null)} />}
  </>
}
