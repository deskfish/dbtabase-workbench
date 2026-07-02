import './prototype.css'

export function PrototypeApp() {
  return <div className="prototype-root">
    <header className="proto-topbar">
      <div className="proto-brand"><span>Z</span><strong>数据库管理</strong></div>
      <nav aria-label="工作区标签"><button>query_01</button><button className="active">public.conversation_record</button><button aria-label="新建标签">＋</button></nav>
      <div className="proto-runtime"><span>PostgreSQL 14.8</span><b>● 已连接</b><span className="proto-avatar">Z</span><span>团队⌄</span></div>
    </header>
    <aside className="proto-connection-placeholder" aria-label="个人连接"><strong>连接：个人连接</strong></aside>
    <aside className="proto-catalog-placeholder" aria-label="数据库对象"><strong>数据库</strong></aside>
    <main className="proto-workspace-placeholder" aria-label="数据库工作区"><strong>public.conversation_record</strong></main>
  </div>
}
