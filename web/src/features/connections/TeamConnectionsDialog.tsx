import {useMemo, useState} from 'react'
import type {SavedConnection} from '../../storage/connections'
import type {RegistryConnection} from '../../storage/registryTypes'
import {isTeamConnectionImported} from '../../storage/teamConnectionMatch'
import {Icon} from '../ui/Icon'

export function TeamConnectionsDialog({connections,personalConnections,onCopy,onClose}:{connections:RegistryConnection[];personalConnections:SavedConnection[];onCopy:(id:string)=>void;onClose:()=>void}) {
  const [search,setSearch]=useState('')
  const shown=useMemo(()=>connections.filter(item=>`${item.name} ${item.host} ${item.database}`.toLowerCase().includes(search.toLowerCase())),[connections,search])
  return <div className="dialog-backdrop"><section className="dialog team-dialog" role="dialog" aria-modal="true" aria-label="团队连接">
    <header className="team-dialog-head"><div><h2>团队连接</h2><p>复制团队共享的数据库连接到个人列表，团队原记录会继续保留。</p></div><button className="icon-button" aria-label="关闭团队连接" onClick={onClose}><Icon name="close"/></button></header>
    <div className="team-dialog-toolbar"><input aria-label="搜索团队连接" placeholder="搜索连接名称、主机或数据库" value={search} onChange={event=>setSearch(event.target.value)}/><span>{shown.length} 个连接</span></div>
    <div className="team-table" role="list">{shown.map(item=>{const copied=isTeamConnectionImported(personalConnections,item);return <article key={item.id} role="listitem" className="team-row"><span className={`connection-dot ${item.driver}`}/><div className="team-row-main"><strong>{item.name}</strong><small>{item.driver==='postgres'?'PostgreSQL':'MySQL'} · {item.host}:{item.port} · {item.database}</small></div><span className="team-owner">{item.sharedBy||'团队'}</span><button className={`button compact ${copied?'':'primary'}`} disabled={copied} aria-label={copied?`${item.name} 已在个人`:`复制 ${item.name} 到个人`} onClick={()=>onCopy(item.id)}>{copied?'已在个人':'复制到个人'}</button></article>})}{shown.length===0&&<div className="empty-state">没有匹配的团队连接</div>}</div>
  </section></div>
}
