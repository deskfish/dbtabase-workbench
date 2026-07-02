import { useEffect, useMemo, useState } from 'react'
import type { TeamConnectionFixture } from '../model'
import { PrototypeIcon } from './PrototypeIcon'

type Props={connections:TeamConnectionFixture[];onCopy:(ids:string[])=>void;onClose:()=>void}
export function TeamConnectionsDialog({connections,onCopy,onClose}:Props){
  const [search,setSearch]=useState('')
  const [team,setTeam]=useState('全部')
  const [status,setStatus]=useState('全部')
  const [selected,setSelected]=useState<string[]>([])
  useEffect(()=>{const close=(event:KeyboardEvent)=>event.key==='Escape'&&onClose();document.addEventListener('keydown',close);return()=>document.removeEventListener('keydown',close)},[onClose])
  const shown=useMemo(()=>connections.filter(item=>{
    const matchesSearch=[item.name,item.host,item.database].some(value=>value.toLowerCase().includes(search.toLowerCase()))
    return matchesSearch&&(team==='全部'||item.team===team)&&(status==='全部'||(status==='可复制'?!item.copied:item.copied))
  }),[connections,search,status,team])
  function toggle(id:string){setSelected(current=>current.includes(id)?current.filter(value=>value!==id):[...current,id])}
  return <div className="proto-dialog-backdrop">
    <section className="proto-team-dialog" role="dialog" aria-modal="true" aria-label="团队连接">
      <header><div><h2>复制团队共享连接</h2><p>选择团队中已共享的数据库连接，复制后添加到你的个人连接列表。</p></div><button className="proto-icon-button" aria-label="关闭团队连接" onClick={onClose}><PrototypeIcon name="close"/></button></header>
      <div className="proto-team-toolbar">
        <label className="proto-inline-search"><PrototypeIcon name="search"/><input aria-label="搜索团队连接" placeholder="搜索连接名称 / 主机 / 数据库" value={search} onChange={event=>setSearch(event.target.value)}/></label>
        <label><span>类型</span><select aria-label="数据库类型"><option>PostgreSQL</option><option>MySQL</option></select></label>
        <label><span>团队</span><select aria-label="团队筛选" value={team} onChange={event=>setTeam(event.target.value)}><option>全部</option><option>数据团队</option><option>研发团队</option><option>运维团队</option></select></label>
        <label><span>状态</span><select aria-label="复制状态" value={status} onChange={event=>setStatus(event.target.value)}><option>全部</option><option>可复制</option><option>已在个人</option></select></label>
        <button className="proto-icon-button" aria-label="刷新团队连接"><PrototypeIcon name="refresh"/></button>
      </div>
      <div className="proto-team-table-wrap"><table className="proto-team-table"><thead><tr><th/><th>连接名称</th><th>类型</th><th>主机</th><th>默认数据库</th><th>分享人</th><th>最近同步</th><th>状态</th></tr></thead><tbody>{shown.map(item=><tr key={item.id} className={item.copied?'copied':''}><td><input type="checkbox" aria-label={`选择 ${item.name}`} disabled={item.copied} checked={selected.includes(item.id)} onChange={()=>toggle(item.id)}/></td><td><strong>{item.name}</strong></td><td>{item.driver}</td><td>{item.host}</td><td>{item.database}</td><td>{item.owner}</td><td>{item.syncedAt}</td><td>{item.copied?<span className="proto-copy-state done">● 已在个人</span>:<span className="proto-copy-state">● 可复制</span>}</td></tr>)}</tbody></table></div>
      <footer><div className="proto-team-note"><span>ⓘ</span><p>复制不会修改团队共享配置，仅创建一条独立的个人连接。</p></div><div className="proto-team-summary">已选择 <b>{selected.length}</b> 个连接，复制到 <strong>我的连接</strong></div><button onClick={onClose}>取消</button><button className="proto-primary" aria-label={`复制选中（${selected.length}）`} disabled={!selected.length} onClick={()=>{onCopy(selected);setSelected([])}}>复制选中（{selected.length}）</button></footer>
    </section>
  </div>
}
