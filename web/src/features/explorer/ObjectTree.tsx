import type { DatabaseObject } from '../../api/types'

export function ObjectTree({objects, onSelect}: {objects: DatabaseObject[]; onSelect?: (object: DatabaseObject) => void}) {
  const tables = objects.filter((object) => object.kind === 'table')
  if (tables.length === 0) return <div className="empty-state">连接后在这里浏览表和字段</div>
  return <div role="tree" aria-label="数据库对象" className="object-tree">
    {tables.map((table) => {
      const columns = objects.filter((object) => object.kind === 'column' && object.schema === table.schema && object.parent === table.name)
      return <details key={`${table.catalog}/${table.schema}/${table.name}`} open>
        <summary role="treeitem" aria-expanded="true" onClick={() => onSelect?.(table)}>
          <span className="tree-icon" aria-hidden="true">▦</span>
          <span>{table.schema ? `${table.schema}.` : ''}{table.name}</span>
        </summary>
        <div role="group">
          {columns.map((column) => <button type="button" role="treeitem" key={column.name} onClick={() => onSelect?.(column)}>
            <span className="column-name">{column.name}</span>
            <span className="column-type">{column.dataType}</span>
          </button>)}
        </div>
      </details>
    })}
  </div>
}
