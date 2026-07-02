import { useState } from 'react'
import { dataColumns, dataRows } from '../fixtures'
import { DataGrid } from './DataGrid'
import { PrototypeIcon } from './PrototypeIcon'

export function QueryWorkspace(){
  const [sql,setSQL]=useState('SELECT *\nFROM public.conversation_record\nLIMIT 200 OFFSET 0;')
  const [split,setSplit]=useState(42)
  const [status,setStatus]=useState('就绪')
  const [selected,setSelected]=useState<number|null>(null)
  function run(){setStatus('查询成功')}
  return <section className="proto-query-workspace" style={{'--query-split':`${split}%`} as React.CSSProperties}>
    <header className="proto-query-toolbar"><label><span>数据库：</span><select><option>configuration</option></select></label><i/><label><span>Schema：</span><select><option>public</option></select></label><i/><label><span>表：</span><select><option>conversation_record</option></select></label><i/><button className="proto-primary" aria-label="运行查询" onClick={run}><PrototypeIcon name="play"/>运行</button><button aria-label="停止查询" disabled={status!=='正在查询…'}><PrototypeIcon name="stop"/>停止</button><i/><button><PrototypeIcon name="refresh"/>刷新</button><button><PrototypeIcon name="download"/>导出 CSV</button><button><PrototypeIcon name="plus"/>新建查询</button><span className="proto-toolbar-spacer"/><button aria-label="查询更多操作"><PrototypeIcon name="more"/></button></header>
    <div className="proto-sql-editor"><div className="proto-line-numbers">1<br/>2<br/>3</div><textarea aria-label="SQL 编辑器" value={sql} onChange={event=>setSQL(event.target.value)} spellCheck={false}/><div className="proto-editor-actions"><button><PrototypeIcon name="columns"/>显示列</button><button><PrototypeIcon name="filter"/>筛选</button><button><PrototypeIcon name="settings"/></button></div></div>
    <div className="proto-query-resizer" role="separator" aria-label="调整编辑器高度" aria-valuemin={28} aria-valuemax={72} aria-valuenow={split} tabIndex={0} onKeyDown={event=>{if(event.key==='ArrowUp')setSplit(value=>Math.max(28,value-2));if(event.key==='ArrowDown')setSplit(value=>Math.min(72,value+2))}}><span/></div>
    <div className="proto-query-results"><nav><button className="active">查询结果</button><button>消息</button><span className="proto-toolbar-spacer"/><b>共 12,568 条</b><i/><b>查询耗时 186 ms</b><i/><b>返回 200 行</b></nav><DataGrid columns={dataColumns} rows={dataRows.slice(0,12)} density="compact" selectedRow={selected} onSelectRow={setSelected}/></div>
    <footer className="proto-query-footer"><span className={status==='查询成功'?'success':''}><i className="proto-state-dot"/><b>{status}</b></span><i/><span>查询耗时：186 ms</span><i/><span>返回 200 行 / 共 12,568 行</span><span className="proto-toolbar-spacer"/><button><PrototypeIcon name="history"/>查询历史</button></footer>
  </section>
}
