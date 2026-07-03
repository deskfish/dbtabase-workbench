import { useState } from 'react'
import type { DatabaseObject } from '../../api/types'
import { ContextMenu, type ContextMenuItem } from '../ui/ContextMenu'
import { tableKey } from '../workspace/types'

type TreeMenu = {kind: 'table'; table: DatabaseObject; x: number; y: number}

export function ObjectTree({
  objects,
  selectedTableKey = '',
  objectLabel = '表',
  sqlFeatures = true,
  onOpenTable,
  onOpenTableStructure,
  onNewQuery,
  onDeleteTable,
}: {
  objects: DatabaseObject[]
  selectedTableKey?: string
  objectLabel?: string
  sqlFeatures?: boolean
  onOpenTable?: (table: DatabaseObject) => void
  onOpenTableStructure?: (table: DatabaseObject) => void
  onNewQuery?: (table: DatabaseObject) => void
  onDeleteTable?: (table: DatabaseObject) => void
}) {
  const tables = objects.filter((object) => object.kind === 'table')
  const [menu, setMenu] = useState<TreeMenu | null>(null)

  if (tables.length === 0) return <div className="empty-state compact">连接后在这里浏览{objectLabel}</div>

  const menuItems: ContextMenuItem[] = menu
    ? [
      ...(sqlFeatures ? [{label: '新建查询', action: () => onNewQuery?.(menu.table)}] : []),
      ...(sqlFeatures ? [{separator: true} as ContextMenuItem] : []),
      {label: objectLabel === '集合' ? '打开集合结构' : '打开表结构', action: () => onOpenTableStructure?.(menu.table)},
      ...(sqlFeatures ? [{separator: true} as ContextMenuItem, {label: `删除${objectLabel}`, action: () => onDeleteTable?.(menu.table)}] : []),
    ]
    : []

  return <>
    <div role="tree" aria-label="数据库对象" className="object-tree">
      {tables.map((table) => {
        const key = tableKey(table)
        const isSelected = selectedTableKey === key
        return <div key={key} className={`tree-table-block ${isSelected ? 'selected' : ''}`}>
          <div className="tree-table-row">
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
              <span>{table.name}</span>
            </button>
          </div>
        </div>
      })}
    </div>
    {menu && <ContextMenu x={menu.x} y={menu.y} items={menuItems} onClose={() => setMenu(null)} />}
  </>
}
