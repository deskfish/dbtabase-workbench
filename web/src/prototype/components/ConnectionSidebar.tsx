import { useMemo, useState } from 'react'
import type { ConnectionFixture } from '../model'
import { PrototypeIcon } from './PrototypeIcon'

type Props = {
  connections: ConnectionFixture[]
  selectedId: string
  teamCount: number
  onSelect: (id: string) => void
  onOpenTeam: () => void
  onNew: () => void
  onEdit: (id: string) => void
  onDelete: (id: string) => void
  onShare: (id: string) => void
}

export function ConnectionSidebar({connections,selectedId,teamCount,onSelect,onOpenTeam,onNew,onEdit,onDelete,onShare}: Props) {
  const [search,setSearch] = useState('')
  const [refreshing,setRefreshing] = useState(false)
  const selected = connections.find(item=>item.id===selectedId)
  const shown = useMemo(()=>{
    const term=search.trim().toLowerCase()
    return term ? connections.filter(item=>[item.name,item.host,item.database,item.driver].some(value=>value.toLowerCase().includes(term))) : connections
  },[connections,search])

  function refresh() {
    setRefreshing(true)
    window.setTimeout(()=>setRefreshing(false),420)
  }

  return <aside className="proto-connections" aria-label="个人连接">
    <header className="proto-side-context">
      <strong>连接：个人连接</strong>
      <div>
        <button className="proto-team-count" aria-label="查看共享连接" onClick={onOpenTeam}>共享 <b>{teamCount}</b></button>
        <button className={`proto-icon-button ${refreshing?'is-spinning':''}`} aria-label="刷新连接" onClick={refresh}><PrototypeIcon name="refresh"/></button>
      </div>
    </header>

    <label className="proto-search-field">
      <PrototypeIcon name="search"/>
      <input type="search" aria-label="搜索个人连接" placeholder="搜索个人连接 / 主机" value={search} onChange={event=>setSearch(event.target.value)}/>
    </label>

    <section className="proto-connection-library">
      <header><strong>我的连接 <span>({connections.length})</span></strong><button className="proto-icon-button" aria-label="新建连接" onClick={onNew}><PrototypeIcon name="plus"/></button></header>
      <div className="proto-connection-list">
        {shown.map(item=><button
          key={item.id}
          className={`proto-connection-row ${item.id===selectedId?'active':''}`}
          aria-label={`连接 ${item.name}`}
          aria-current={item.id===selectedId?'true':undefined}
          onClick={()=>onSelect(item.id)}
        >
          <span className={`proto-status-dot ${item.connected?'online':''}`}/>
          <span className="proto-connection-copy">
            <strong>{item.name}</strong>
            <small>{item.driver} <i>·</i> {item.host}</small>
            <small>{item.database}</small>
            <span className="proto-badges">
              {item.connected&&<em className="success">已连接</em>}
              {item.shared&&<em>已共享</em>}
            </span>
          </span>
        </button>)}
        {shown.length===0&&<div className="proto-empty">没有匹配的个人连接</div>}
      </div>
    </section>

    <div className="proto-team-entry">
      <button aria-label="浏览团队连接" onClick={onOpenTeam}>
        <PrototypeIcon name="team"/><span><strong>浏览团队连接</strong><small>选择后复制到个人列表</small></span><PrototypeIcon name="chevron"/>
      </button>
    </div>

    <footer className="proto-side-footer" aria-label="连接操作">
      <button aria-label="新建连接" onClick={onNew}><PrototypeIcon name="plus"/></button>
      <button aria-label="编辑当前连接" disabled={!selected} onClick={()=>selected&&onEdit(selected.id)}><PrototypeIcon name="edit"/></button>
      <button aria-label="删除当前连接" disabled={!selected} onClick={()=>selected&&onDelete(selected.id)}><PrototypeIcon name="trash"/></button>
      <button aria-label="分享当前连接" disabled={!selected||selected.shared} onClick={()=>selected&&onShare(selected.id)}><PrototypeIcon name="share"/></button>
      <button aria-label="连接设置"><PrototypeIcon name="settings"/></button>
    </footer>
  </aside>
}
