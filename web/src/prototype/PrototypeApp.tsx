import './prototype.css'
import { useState } from 'react'
import { dataColumns, dataRows, databases, personalConnections, tables, teamConnections } from './fixtures'
import { CatalogSidebar } from './components/CatalogSidebar'
import { ConnectionSidebar } from './components/ConnectionSidebar'
import { DataWorkspace, type DataSection } from './components/DataWorkspace'
import { TeamConnectionsDialog } from './components/TeamConnectionsDialog'

export function PrototypeApp() {
  const [connections,setConnections]=useState(personalConnections)
  const [selectedConnection,setSelectedConnection]=useState('conn-1')
  const [selectedDatabase,setSelectedDatabase]=useState('configuration')
  const [selectedTable,setSelectedTable]=useState('conversation_record')
  const [teamOpen,setTeamOpen]=useState(false)
  const [teams,setTeams]=useState(teamConnections)
  const [section,setSection]=useState<DataSection>('data')
  const [notice,setNotice]=useState('')
  return <div className="prototype-root">
    <header className="proto-topbar">
      <div className="proto-brand"><span>Z</span><strong>数据库管理</strong></div>
      <nav aria-label="工作区标签"><button>query_01</button><button className="active">public.conversation_record</button><button aria-label="新建标签">＋</button></nav>
      <div className="proto-runtime"><span>PostgreSQL 14.8</span><b>● 已连接</b><span className="proto-avatar">Z</span><span>团队⌄</span></div>
    </header>
    <ConnectionSidebar connections={connections} selectedId={selectedConnection} teamCount={6} onSelect={setSelectedConnection} onOpenTeam={()=>setTeamOpen(true)} onNew={()=>setNotice('新建连接')} onEdit={()=>setNotice('编辑连接')} onDelete={id=>setConnections(current=>current.filter(item=>item.id!==id))} onShare={id=>setConnections(current=>current.map(item=>item.id===id?{...item,shared:true}:item))}/>
    <CatalogSidebar databases={databases} tables={tables} selectedDatabase={selectedDatabase} selectedTable={selectedTable} onSelectDatabase={setSelectedDatabase} onSelectTable={setSelectedTable}/>
    <main className="proto-workspace" aria-label="数据库工作区"><DataWorkspace table={selectedTable} columns={dataColumns} rows={dataRows} activeSection={section} onSectionChange={setSection}/>{notice&&<span className="proto-notice">{notice}</span>}</main>
    {teamOpen&&<TeamConnectionsDialog connections={teams} onClose={()=>setTeamOpen(false)} onCopy={ids=>{setTeams(current=>current.map(item=>ids.includes(item.id)?{...item,copied:true}:item));setConnections(current=>[...current,...teams.filter(item=>ids.includes(item.id)&&!current.some(connection=>connection.host===item.host)).map(({owner:_,team:__,syncedAt:___,copied:____,...item})=>item)])}}/>}
  </div>
}
