import { useMemo, useState } from 'react'
import type { DatabaseFixture, TableFixture } from '../model'
import { PrototypeIcon } from './PrototypeIcon'

type Props = {
  databases: DatabaseFixture[]
  tables: TableFixture[]
  selectedDatabase: string
  selectedTable: string
  onSelectDatabase: (name:string)=>void
  onSelectTable: (name:string)=>void
}

const groups = [
  {label:'表',count:28,open:true,icon:'table' as const},
  {label:'视图',count:6}, {label:'函数',count:24}, {label:'索引',count:42}, {label:'序列',count:8}, {label:'类型',count:12},
]

export function CatalogSidebar({databases,tables,selectedDatabase,selectedTable,onSelectDatabase,onSelectTable}:Props) {
  const [databaseOpen,setDatabaseOpen] = useState(true)
  const [schemaOpen,setSchemaOpen] = useState(true)
  const [tableOpen,setTableOpen] = useState(true)
  const [filter,setFilter] = useState('')
  const shownTables=useMemo(()=>tables.filter(table=>table.name.toLowerCase().includes(filter.toLowerCase())),[filter,tables])
  return <aside className="proto-catalog" aria-label="数据库对象">
    <section className="proto-databases">
      <header><strong>数据库</strong><button className="proto-icon-button" aria-label={databaseOpen?'收起数据库':'展开数据库'} onClick={()=>setDatabaseOpen(value=>!value)}><span className={databaseOpen?'chevron-open':''}>⌃</span></button></header>
      {databaseOpen&&<div className="proto-database-list">{databases.map(database=><button key={database.name} className={database.name===selectedDatabase?'active':''} onClick={()=>onSelectDatabase(database.name)}><PrototypeIcon name="database"/><span>{database.name}</span>{database.name===selectedDatabase&&<em>当前</em>}</button>)}</div>}
    </section>
    <section className="proto-objects">
      <header><div><strong>对象</strong><span>32 个</span></div><div><button className="proto-icon-button" aria-label="筛选对象" onClick={()=>setFilter(value=>value?'':'conversation')}><PrototypeIcon name="filter"/></button><button className="proto-icon-button" aria-label="对象更多操作"><PrototypeIcon name="more"/></button></div></header>
      {filter&&<label className="proto-catalog-filter"><PrototypeIcon name="search"/><input aria-label="搜索数据库对象" value={filter} onChange={event=>setFilter(event.target.value)}/></label>}
      <div className="proto-object-tree">
        <button className="proto-tree-group" onClick={()=>setSchemaOpen(value=>!value)}><span className={schemaOpen?'open':''}>›</span><b className="schema-symbol">⌘</b><strong>public</strong><em>32</em></button>
        {schemaOpen&&<div className="proto-schema-children">
          {groups.map(group=><div key={group.label}>
            <button className="proto-tree-group nested" onClick={()=>group.label==='表'&&setTableOpen(value=>!value)}><span className={group.label==='表'&&tableOpen?'open':''}>›</span><PrototypeIcon name={group.icon??'database'}/><strong>{group.label}</strong><em>{group.count}</em></button>
            {group.label==='表'&&tableOpen&&<div className="proto-table-list">{shownTables.map(table=><button key={table.name} className={table.name===selectedTable?'active':''} aria-label={`打开表 ${table.name}`} onClick={()=>onSelectTable(table.name)}><PrototypeIcon name="table"/><span>{table.name}</span></button>)}<button className="proto-more-tables">更多 (20)</button></div>}
          </div>)}
        </div>}
      </div>
    </section>
  </aside>
}
