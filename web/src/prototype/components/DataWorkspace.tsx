import { useMemo, useState } from 'react'
import type { DataColumn, DataRow } from '../model'
import { DataGrid } from './DataGrid'
import { PrototypeIcon } from './PrototypeIcon'

export type DataSection = 'data'|'schema'|'indexes'|'relations'|'permissions'|'ddl'
type Props = {table:string;columns:DataColumn[];rows:DataRow[];activeSection:DataSection;onSectionChange:(section:DataSection)=>void}
const sections: {id:DataSection;label:string}[]=[{id:'data',label:'数据预览'},{id:'schema',label:'字段结构'},{id:'indexes',label:'索引'},{id:'relations',label:'关系'},{id:'permissions',label:'权限'},{id:'ddl',label:'DDL'}]

export function DataWorkspace({table,columns,rows,activeSection,onSectionChange}:Props) {
  const [showFilter,setShowFilter]=useState(false)
  const [search,setSearch]=useState('')
  const [density,setDensity]=useState<'comfortable'|'compact'>('comfortable')
  const [selectedRow,setSelectedRow]=useState<number|null>(null)
  const [page,setPage]=useState(1)
  const [columnMenu,setColumnMenu]=useState(false)
  const [visible,setVisible]=useState(()=>new Set(columns.map(column=>column.key)))
  const [notice,setNotice]=useState('')
  const shownColumns=columns.filter(column=>visible.has(column.key))
  const shownRows=useMemo(()=>{
    const term=search.trim().toLowerCase()
    return term?rows.filter(row=>Object.values(row).some(value=>String(value??'').toLowerCase().includes(term))):rows
  },[rows,search])
  function action(message:string){setNotice(message);window.setTimeout(()=>setNotice(''),1500)}

  return <section className="proto-data-workspace">
    <header className="proto-table-identity">
      <div className="proto-table-title"><PrototypeIcon name="table"/><strong>public.{table}</strong><span>表 / PostgreSQL Table</span></div>
      <div className="proto-table-facts"><b>12,568 行</b><b>18 字段</b><b>主键&nbsp; id</b><b>最近刷新&nbsp; 186 ms</b></div>
      <div className="proto-table-actions">
        <button onClick={()=>action('数据已刷新')}><PrototypeIcon name="refresh"/>刷新</button>
        <button onClick={()=>action('表名已复制')}><PrototypeIcon name="copy"/>复制表名</button>
        <button onClick={()=>onSectionChange('schema')}><PrototypeIcon name="edit"/>编辑表结构</button>
        <button onClick={()=>action('CSV 已准备')}><PrototypeIcon name="download"/>导出 CSV</button>
        <button onClick={()=>action('已新增空白行')}><PrototypeIcon name="plus"/>新增行</button>
        <button aria-label="更多表操作" onClick={()=>action('更多操作')}><PrototypeIcon name="more"/>更多</button>
      </div>
    </header>
    <nav className="proto-section-tabs" aria-label="表工作区">{sections.map(section=><button key={section.id} role="tab" aria-selected={activeSection===section.id} className={activeSection===section.id?'active':''} onClick={()=>onSectionChange(section.id)}>{section.label}</button>)}</nav>
    <div className="proto-data-toolbar">
      <label className="proto-inline-search"><PrototypeIcon name="search"/><input aria-label="搜索字段或内容" placeholder="搜索字段或内容" value={search} onChange={event=>setSearch(event.target.value)}/></label>
      <button className={showFilter?'active':''} aria-label="WHERE 条件" onClick={()=>setShowFilter(value=>!value)}>WHERE 条件 <span>⌄</span></button>
      <button onClick={()=>action('排序已打开')}><PrototypeIcon name="sort"/>排序</button>
      <div className="proto-column-menu-wrap"><button onClick={()=>setColumnMenu(value=>!value)}><PrototypeIcon name="columns"/>显示列</button>{columnMenu&&<div className="proto-column-menu">{columns.map(column=><label key={column.key}><input type="checkbox" checked={visible.has(column.key)} onChange={()=>setVisible(current=>{const next=new Set(current);next.has(column.key)?next.delete(column.key):next.add(column.key);return next})}/>{column.label}</label>)}</div>}</div>
      <button aria-label={density==='comfortable'?'切换为紧凑密度':'切换为舒适密度'} onClick={()=>setDensity(value=>value==='comfortable'?'compact':'comfortable')}><PrototypeIcon name="density"/>密度</button>
      <span className="proto-toolbar-spacer"/>
      <select aria-label="每页行数" defaultValue="200"><option>100</option><option>200</option><option>500</option></select>
    </div>
    {showFilter&&<div className="proto-filter-panel">
      <label><span>字段</span><select aria-label="筛选字段"><option>request_client_id</option><option>message_status</option><option>created_time</option></select></label>
      <label><span>运算符</span><select aria-label="筛选运算符"><option>等于</option><option>包含</option><option>不等于</option></select></label>
      <label className="filter-value"><span>值</span><input aria-label="筛选值" placeholder="输入筛选值"/></label>
      <button className="proto-primary" onClick={()=>{setShowFilter(false);action('筛选条件已应用')}}>应用筛选</button>
      <button onClick={()=>setShowFilter(false)}>清空</button>
    </div>}
    {activeSection==='data'?<DataGrid columns={shownColumns} rows={shownRows} density={density} selectedRow={selectedRow} onSelectRow={setSelectedRow}/>:<div className="proto-section-placeholder">选择“字段结构”查看可编辑结构原型</div>}
    <footer className="proto-data-footer">
      <div><span>表&nbsp; public.{table}</span><i/><span>已加载 200 / 共 12,568 行</span><i/><span>查询耗时 186 ms</span>{selectedRow!==null&&<><i/><b>已选择第 {selectedRow+1} 行</b></>}</div>
      <div className="proto-pagination"><button disabled={page===1} onClick={()=>setPage(1)}>ǀ‹</button><button disabled={page===1} onClick={()=>setPage(value=>Math.max(1,value-1))}>‹</button>{[1,2,3,4,5].map(value=><button key={value} className={page===value?'active':''} onClick={()=>setPage(value)}>{value}</button>)}<span>…</span><button onClick={()=>setPage(63)}>63</button><button disabled={page===63} onClick={()=>setPage(value=>Math.min(63,value+1))}>›</button><button disabled={page===63} onClick={()=>setPage(63)}>›ǀ</button><button className="history" onClick={()=>action('查询历史已打开')}><PrototypeIcon name="history"/>查询历史</button></div>
    </footer>
    {notice&&<div className="proto-toast" role="status"><PrototypeIcon name="check"/>{notice}</div>}
  </section>
}
