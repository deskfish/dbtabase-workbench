import {useEffect, useMemo, useRef, useState} from 'react'
import type {DriverId} from '../../api/driver'
import type {SavedConnection} from '../../storage/connections'
import type {RegistryConnection} from '../../storage/registryTypes'
import {dedupeTeamConnections, isTeamConnectionGroupImported} from '../../storage/teamConnectionMatch'
import {DriverBadge} from './DriverBadge'
import {Checkbox} from '../ui/Checkbox'
import {Icon} from '../ui/Icon'
import {SelectControl} from '../ui/SelectControl'

type TeamDriverFilter = 'all' | DriverId

const TEAM_DRIVER_FILTER_OPTIONS: {value: TeamDriverFilter; label: string}[] = [
  {value: 'all', label: '全部'},
  {value: 'postgres', label: 'PostgreSQL'},
  {value: 'mysql', label: 'MySQL'},
  {value: 'mongodb', label: 'MongoDB'},
  {value: 'redis', label: 'Redis'},
]

export function TeamConnectionsDialog({connections,personalConnections,onCopy,onClose}:{connections:RegistryConnection[];personalConnections:SavedConnection[];onCopy:(id:string)=>void;onClose:()=>void}) {
  const [search,setSearch]=useState('')
  const [driver,setDriver]=useState<TeamDriverFilter>('all')
  const [status,setStatus]=useState<'all'|'available'|'copied'>('available')
  const [selected,setSelected]=useState<string[]>([])
  const dialogRef=useRef<HTMLElement>(null)
  const openerRef=useRef<HTMLElement|null>(document.activeElement as HTMLElement|null)
  const groups=useMemo(()=>dedupeTeamConnections(connections),[connections])
  useEffect(()=>{
    const dialog=dialogRef.current
    const focusable=()=>Array.from(dialog?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), [role="combobox"]:not([aria-disabled="true"])')??[])
    focusable()[0]?.focus()
    const close=(event:KeyboardEvent)=>{
      if(event.key==='Escape'){event.preventDefault();onClose();return}
      if(event.key!=='Tab')return
      const nodes=focusable();if(!nodes.length)return
      const first=nodes[0],last=nodes[nodes.length-1]
      if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus()}
      else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus()}
    }
    window.addEventListener('keydown',close)
    return()=>{window.removeEventListener('keydown',close);openerRef.current?.focus()}
  },[onClose])
  const shown=useMemo(()=>groups.filter(item=>{
    const copied=isTeamConnectionGroupImported(personalConnections,item)
    const matchesText=`${item.name} ${item.host} ${item.sharedBy}`.toLowerCase().includes(search.toLowerCase())
    return matchesText&&(driver==='all'||item.driver===driver)&&(status==='all'||(status==='copied'?copied:!copied))
  }),[driver,groups,personalConnections,search,status])
  const available=shown.filter(item=>!isTeamConnectionGroupImported(personalConnections,item))
  const allCopied=groups.length>0&&groups.every(item=>isTeamConnectionGroupImported(personalConnections,item))
  const showCompletion=allCopied&&status==='available'&&!search.trim()&&driver==='all'
  const allSelected=available.length>0&&available.every(item=>selected.includes(item.key))
  const toggle=(key:string)=>setSelected(current=>current.includes(key)?current.filter(value=>value!==key):[...current,key])
  const copySelected=()=>{
    selected.forEach(key=>{
      const group=groups.find(item=>item.key===key)
      if (group) onCopy(group.id)
    })
    setSelected([])
  }
  return <div className="dialog-backdrop"><section ref={dialogRef} className="dialog team-dialog" role="dialog" aria-modal="true" aria-label="复制团队共享连接">
    <header className="team-dialog-head"><div><h2>复制团队共享连接</h2><p>选择团队中已共享的数据库连接，复制后添加到你的个人连接列表；连接后可自行切换数据库。</p></div><button className="icon-button" aria-label="关闭团队连接" onClick={onClose}><Icon name="close"/></button></header>
    <div className="team-dialog-toolbar">
      <input aria-label="搜索团队连接" placeholder="搜索连接名称、主机或分享人" value={search} onChange={event=>setSearch(event.target.value)}/>
      <label>类型<SelectControl ariaLabel="连接类型" value={driver} options={TEAM_DRIVER_FILTER_OPTIONS} onChange={value=>setDriver(value as TeamDriverFilter)}/></label>
      <label>状态<SelectControl ariaLabel="复制状态" value={status} options={[{value:'all',label:'全部'},{value:'available',label:'可复制'},{value:'copied',label:'已在个人'}]} onChange={value=>setStatus(value as typeof status)}/></label>
      <span>{shown.length} 个连接</span>
    </div>
    {showCompletion?<div className="team-completion"><Icon name="check"/><h3>团队连接均已添加到个人列表</h3><p>当前没有待复制连接，可以查看已经添加的连接。</p><button className="button" onClick={()=>setStatus('copied')}>查看已在个人</button></div>:<div className="team-table-wrap">
      <div className="team-table-head"><Checkbox compact label="选择全部可复制连接" aria-label="选择全部可复制连接" checked={allSelected} disabled={!available.length} onChange={()=>setSelected(current=>allSelected?current.filter(key=>!available.some(item=>item.key===key)):[...new Set([...current,...available.map(item=>item.key)])])}/><span>连接名称</span><span>类型</span><span>主机</span><span>分享人</span><span>状态</span></div>
      <div className="team-table" role="list">{shown.map(item=>{const copied=isTeamConnectionGroupImported(personalConnections,item);return <article key={item.key} role="listitem" className="team-row"><Checkbox compact label={`选择 ${item.name}`} aria-label={`选择 ${item.name}`} checked={selected.includes(item.key)} disabled={copied} onChange={()=>toggle(item.key)}/><strong>{item.name}</strong><span><DriverBadge driver={item.driver} /></span><span>{item.host}:{item.port}</span><span>{item.sharedBy}</span><span className={copied?'team-copied':'team-available'}>● {copied?'已在个人':'可复制'}</span></article>})}{shown.length===0&&<div className="empty-state">没有匹配的团队连接</div>}</div>
    </div>}
    <footer className="team-dialog-footer"><span>仅复制配置到个人列表；密码仍由浏览器加密保存。</span><div><button className="button" onClick={onClose}>关闭</button>{!showCompletion&&<button className="button primary" disabled={!selected.length} aria-label={`复制选中（${selected.length}）`} onClick={copySelected}>复制选中（{selected.length}）</button>}</div></footer>
  </section></div>
}
