import './prototype.css'
import { useState } from 'react'
import { databases, personalConnections, tables } from './fixtures'
import { CatalogSidebar } from './components/CatalogSidebar'
import { ConnectionSidebar } from './components/ConnectionSidebar'

export function PrototypeApp() {
  const [connections,setConnections]=useState(personalConnections)
  const [selectedConnection,setSelectedConnection]=useState('conn-1')
  const [selectedDatabase,setSelectedDatabase]=useState('configuration')
  const [selectedTable,setSelectedTable]=useState('conversation_record')
  const [teamOpen,setTeamOpen]=useState(false)
  const [notice,setNotice]=useState('')
  return <div className="prototype-root">
    <header className="proto-topbar">
      <div className="proto-brand"><span>Z</span><strong>数据库管理</strong></div>
      <nav aria-label="工作区标签"><button>query_01</button><button className="active">public.conversation_record</button><button aria-label="新建标签">＋</button></nav>
      <div className="proto-runtime"><span>PostgreSQL 14.8</span><b>● 已连接</b><span className="proto-avatar">Z</span><span>团队⌄</span></div>
    </header>
    <ConnectionSidebar connections={connections} selectedId={selectedConnection} teamCount={6} onSelect={setSelectedConnection} onOpenTeam={()=>setTeamOpen(true)} onNew={()=>setNotice('新建连接')} onEdit={()=>setNotice('编辑连接')} onDelete={id=>setConnections(current=>current.filter(item=>item.id!==id))} onShare={id=>setConnections(current=>current.map(item=>item.id===id?{...item,shared:true}:item))}/>
    <CatalogSidebar databases={databases} tables={tables} selectedDatabase={selectedDatabase} selectedTable={selectedTable} onSelectDatabase={setSelectedDatabase} onSelectTable={setSelectedTable}/>
    <main className="proto-workspace-placeholder" aria-label="数据库工作区"><strong>public.{selectedTable}</strong>{notice&&<span className="proto-notice">{notice}</span>}</main>
    {teamOpen&&<div className="proto-dialog-backdrop"><div role="dialog" aria-label="团队连接"><button aria-label="关闭团队连接" onClick={()=>setTeamOpen(false)}>关闭</button></div></div>}
  </div>
}
