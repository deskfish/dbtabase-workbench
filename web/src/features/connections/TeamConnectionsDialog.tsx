import {useEffect, useMemo, useState} from 'react'
import type {SavedConnection} from '../../storage/connections'
import type {RegistryConnection} from '../../storage/registryTypes'
import {isTeamConnectionImported} from '../../storage/teamConnectionMatch'
import {Icon} from '../ui/Icon'
import {SelectControl} from '../ui/SelectControl'

export function TeamConnectionsDialog({connections,personalConnections,onCopy,onClose}:{connections:RegistryConnection[];personalConnections:SavedConnection[];onCopy:(id:string)=>void;onClose:()=>void}) {
  const [search,setSearch]=useState('')
  const [driver,setDriver]=useState<'all'|'postgres'|'mysql'>('all')
  const [status,setStatus]=useState<'all'|'available'|'copied'>('all')
  const [selected,setSelected]=useState<string[]>([])
  useEffect(()=>{const close=(event:KeyboardEvent)=>{if(event.key==='Escape')onClose()};window.addEventListener('keydown',close);return()=>window.removeEventListener('keydown',close)},[onClose])
  const shown=useMemo(()=>connections.filter(item=>{
    const copied=isTeamConnectionImported(personalConnections,item)
    const matchesText=`${item.name} ${item.host} ${item.database} ${item.sharedBy??''}`.toLowerCase().includes(search.toLowerCase())
    return matchesText&&(driver==='all'||item.driver===driver)&&(status==='all'||(status==='copied'?copied:!copied))
  }),[connections,driver,personalConnections,search,status])
  const available=shown.filter(item=>!isTeamConnectionImported(personalConnections,item))
  const allSelected=available.length>0&&available.every(item=>selected.includes(item.id))
  const toggle=(id:string)=>setSelected(current=>current.includes(id)?current.filter(value=>value!==id):[...current,id])
  const copySelected=()=>{selected.forEach(id=>onCopy(id));setSelected([])}
  return <div className="dialog-backdrop"><section className="dialog team-dialog" role="dialog" aria-modal="true" aria-label="复制团队共享连接">
    <header className="team-dialog-head"><div><h2>复制团队共享连接</h2><p>选择团队中已共享的数据库连接，复制后添加到你的个人连接列表，不修改团队记录。</p></div><button className="icon-button" aria-label="关闭团队连接" onClick={onClose}><Icon name="close"/></button></header>
    <div className="team-dialog-toolbar">
      <input aria-label="搜索团队连接" placeholder="搜索连接名称、主机或数据库" value={search} onChange={event=>setSearch(event.target.value)}/>
      <label>类型<SelectControl ariaLabel="连接类型" value={driver} options={[{value:'all',label:'全部'},{value:'postgres',label:'PostgreSQL'},{value:'mysql',label:'MySQL'}]} onChange={value=>setDriver(value as typeof driver)}/></label>
      <label>状态<SelectControl ariaLabel="复制状态" value={status} options={[{value:'all',label:'全部'},{value:'available',label:'可复制'},{value:'copied',label:'已在个人'}]} onChange={value=>setStatus(value as typeof status)}/></label>
      <span>{shown.length} 个连接</span>
    </div>
    <div className="team-table-wrap">
      <div className="team-table-head"><input type="checkbox" aria-label="选择全部可复制连接" checked={allSelected} disabled={!available.length} onChange={()=>setSelected(current=>allSelected?current.filter(id=>!available.some(item=>item.id===id)):[...new Set([...current,...available.map(item=>item.id)])])}/><span>连接名称</span><span>类型</span><span>主机</span><span>默认数据库</span><span>分享人</span><span>状态</span></div>
      <div className="team-table" role="list">{shown.map(item=>{const copied=isTeamConnectionImported(personalConnections,item);return <article key={item.id} role="listitem" className="team-row"><input type="checkbox" aria-label={`选择 ${item.name}`} checked={selected.includes(item.id)} disabled={copied} onChange={()=>toggle(item.id)}/><strong>{item.name}</strong><span>{item.driver==='postgres'?'PostgreSQL':'MySQL'}</span><span>{item.host}:{item.port}</span><span>{item.database}</span><span>{item.sharedBy||'团队'}</span><span className={copied?'team-copied':'team-available'}>● {copied?'已在个人':'可复制'}</span></article>})}{shown.length===0&&<div className="empty-state">没有匹配的团队连接</div>}</div>
    </div>
    <footer className="team-dialog-footer"><span>仅复制配置到个人列表；密码仍由浏览器加密保存。</span><div><button className="button" onClick={onClose}>取消</button><button className="button primary" disabled={!selected.length} aria-label={`复制选中（${selected.length}）`} onClick={copySelected}>复制选中（{selected.length}）</button></div></footer>
  </section></div>
}
