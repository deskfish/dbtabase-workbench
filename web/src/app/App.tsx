import { useCallback, useEffect, useState } from 'react'
import type { APIClient } from '../api/client'
import type { ConnectionInput, DatabaseObject, MutationInput, QueryResult, QueryRisk } from '../api/types'
import { ObjectTree } from '../features/explorer/ObjectTree'
import { SqlEditor } from '../features/editor/SqlEditor'
import { RiskDialog } from '../features/editor/RiskDialog'
import { ResultGrid } from '../features/results/ResultGrid'
import { ConnectionDialog, type ConnectionOptions } from '../features/connections/ConnectionDialog'
import { createVault, unlockVault } from '../crypto/vault'
import { listConnections, saveConnection, type SavedConnection } from '../storage/connections'
import { addHistory, listHistory, toggleFavorite, type HistoryEntry } from '../features/history/store'
import { HistoryPanel } from '../features/history/HistoryPanel'
import { useTransactionGuard } from '../features/editor/useTransaction'
import { TableView } from '../features/table/TableView'

export type WorkbenchAPI = Pick<APIClient, 'createSession'|'connect'|'disconnect'|'metadata'|'startQuery'|'queryResult'|'cancelQuery'|'exportCSV'|'beginTransaction'|'finishTransaction'|'mutate'>

export function App({api, initialConnectionId = '', initialSQL = 'SELECT *\nFROM your_table\nLIMIT 200;'}: {api:WorkbenchAPI; initialConnectionId?:string; initialSQL?:string}) {
  const [connectionId, setConnectionId] = useState(initialConnectionId)
  const [objects, setObjects] = useState<DatabaseObject[]>([])
  const [sql, setSQL] = useState(initialSQL)
  const [result, setResult] = useState<QueryResult | null>(null)
  const [queryId, setQueryId] = useState('')
  const [status, setStatus] = useState<'idle'|'running'|'error'>('idle')
  const [message, setMessage] = useState('尚未执行查询')
  const [risk, setRisk] = useState<QueryRisk | null>(null)
  const transaction = useTransactionGuard()
  const transactionId = transaction.transactionId
  const [savedConnections, setSavedConnections] = useState<SavedConnection[]>([])
  const [connectionDialog, setConnectionDialog] = useState<SavedConnection | 'new' | null>(null)
  const [history, setHistory] = useState<HistoryEntry[]>(() => listHistory())
  const [resultTab, setResultTab] = useState<'result'|'history'>('result')
  const [selectedTable, setSelectedTable] = useState<DatabaseObject | null>(null)
  const connected = Boolean(connectionId)

  useEffect(() => { void api.createSession().catch(() => setMessage('无法建立匿名会话')) }, [api])
  useEffect(() => { void listConnections().then(setSavedConnections) }, [])
  useEffect(() => {
    if (!connectionId) return
    void api.metadata(connectionId).then(setObjects).catch(() => setObjects([]))
  }, [api, connectionId])

  const run = useCallback(async (confirmation?: {confirmed:boolean; confirmationTarget?:string}) => {
    if (!connectionId || !sql.trim()) return
    setRisk(null); setStatus('running'); setMessage('正在执行…')
    try {
      const id = await api.startQuery(connectionId, sql, {...confirmation, transactionId: transactionId || undefined})
      setQueryId(id)
      for (;;) {
        const page = await api.queryResult(connectionId, id)
        if (page.status === 'running') { await new Promise((resolve) => setTimeout(resolve, 150)); continue }
        setResult(page); setStatus('idle'); setResultTab('result'); setMessage(`完成 · ${page.rows?.length ?? 0} 行 · ${page.durationMs} ms`)
        addHistory({sql, connectionName:'当前连接', durationMs:page.durationMs, status:'success', affectedRows:page.affectedRows}); setHistory(listHistory()); break
      }
    } catch (error) {
      setStatus('error'); setMessage(error instanceof Error ? error.message : '查询执行失败')
      addHistory({sql, connectionName:'当前连接', status:'error'}); setHistory(listHistory())
    }
  }, [api, connectionId, sql, transactionId])

  const execute = useCallback(() => {
    const detected = classifyClientRisk(sql)
    if (detected.level !== 'safe') { setRisk(detected); return }
    void run()
  }, [run, sql])

  const transactionLabel = transactionId ? '事务进行中' : '自动提交'
  const columns = result?.columns ?? []
  const rows = result?.rows ?? []

  async function connect(input: ConnectionInput | null, options: ConnectionOptions) {
    let connection = input
    if (!connection && connectionDialog && connectionDialog !== 'new') {
      if (!connectionDialog.encryptedPassword) throw new Error('保存的连接不包含密码')
      const vault = await unlockVault(options.unlockPassword, connectionDialog.encryptedPassword.kdf)
      const password = await vault.decryptSecret(connectionDialog.encryptedPassword)
      connection = {...connectionDialog, password}
    }
    if (!connection) throw new Error('连接配置无效')
    const id = await api.connect(connection)
    setConnectionId(id); setConnectionDialog(null); setMessage(`已连接到 ${options.name}`)
    if (options.save && input) {
      const vault = await createVault(options.unlockPassword)
      await saveConnection({...input, id:crypto.randomUUID(), name:options.name, encryptedPassword:await vault.encryptSecret(input.password)})
      setSavedConnections(await listConnections())
    }
  }

  async function exportResult() {
    if (!result) return
    const blob = await api.exportCSV(connectionId, result.queryId)
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'query-result.csv'; anchor.click()
    URL.revokeObjectURL(url)
  }

  return <div className="app-shell">
    <a className="skip-link" href="#sql-editor">跳到 SQL 编辑器</a>
    <header className="topbar">
      <div className="brand"><span className="brand-mark">DB</span><div><h1>Database Workbench</h1><p>MySQL · PostgreSQL</p></div></div>
      <button type="button" className={`connection-pill ${connected ? 'connected' : ''}`} onClick={() => connected ? void api.disconnect(connectionId).then(()=>setConnectionId('')) : setConnectionDialog('new')}><span />{connected ? '断开连接' : '新建连接'}</button>
    </header>
    <aside className="sidebar" aria-label="数据库导航">
      <div className="panel-heading"><div><span>资源管理器</span><small>{objects.filter((item) => item.kind === 'table').length} 张表</small></div><button type="button" aria-label="新建连接" className="icon-button" onClick={() => setConnectionDialog('new')}>＋</button></div>
      {!connected && savedConnections.length > 0 && <div className="saved-connections"><span>已保存连接</span>{savedConnections.map((saved) => <button type="button" key={saved.id} onClick={() => setConnectionDialog(saved)}><i className={saved.driver} /><b>{saved.name}</b><small>{saved.host}:{saved.port}</small></button>)}</div>}
      <ObjectTree objects={objects} onSelect={(object) => { if (object.kind === 'table') { setSelectedTable(object); setSQL(`SELECT *\nFROM ${object.schema ? object.schema + '.' : ''}${object.name}\nLIMIT 200;`) } }} />
    </aside>
    <main className="workspace">
      <div className="status-rail" aria-hidden="true" />
      <nav className="tabbar" aria-label="SQL 标签页"><button type="button" className="tab active"><span>query_01.sql</span><i>×</i></button><button type="button" className="new-tab" aria-label="新建查询标签">＋</button></nav>
      <div className="query-toolbar">
        <button type="button" aria-label="执行 SQL" className="button primary" onClick={execute} disabled={!connected || status === 'running'}>▶ 执行 SQL</button>
        <button type="button" aria-label="停止查询" className="button ghost" disabled={!queryId || status !== 'running'} onClick={() => void api.cancelQuery(connectionId, queryId)}>■ 停止</button>
        <span className="toolbar-separator" />
        <button type="button" className="button ghost" onClick={async () => transaction.open(await api.beginTransaction(connectionId))} disabled={!connected || Boolean(transactionId)}>开始事务</button>
        <button type="button" className="button ghost" onClick={async () => {await api.finishTransaction(connectionId, transactionId, 'commit'); transaction.close()}} disabled={!transactionId}>提交</button>
        <button type="button" className="button ghost" onClick={async () => {await api.finishTransaction(connectionId, transactionId, 'rollback'); transaction.close()}} disabled={!transactionId}>回滚</button>
        <span className={`transaction-state ${transactionId ? 'open' : ''}`}>{transactionLabel}</span>
      </div>
      <section id="sql-editor" className="editor-pane" aria-label="SQL 编辑区"><SqlEditor value={sql} onChange={setSQL} onExecute={execute} /></section>
      <section className="results-pane" aria-label="查询结果">
        <div className="results-tabs"><button className={resultTab === 'result' ? 'active' : ''} onClick={()=>setResultTab('result')}>结果</button><button className={resultTab === 'history' ? 'active' : ''} onClick={()=>setResultTab('history')}>历史</button><span /><button className={!result ? 'disabled' : ''} disabled={!result} onClick={()=>void exportResult()}>导出 CSV</button></div>
        {resultTab === 'history' ? <HistoryPanel entries={history} onSelect={(value)=>{setSQL(value);setResultTab('result')}} onFavorite={(id)=>{toggleFavorite(id);setHistory(listHistory())}} /> : selectedTable && result ? <TableView schema={selectedTable.schema} table={selectedTable.name} columns={columns} rows={rows} uniqueKey={objects.filter((object)=>object.kind === 'key' && object.schema === selectedTable.schema && object.parent === selectedTable.name).map((object)=>object.name)} onMutate={async (operation,input)=>{await api.mutate(connectionId,operation,{...input,transactionId:transactionId||undefined}); await run()}} /> : <ResultGrid columns={columns} rows={rows} />}
        <footer className={`execution-status ${status}`} aria-live="polite"><span />{message}{result?.truncated ? ' · 已达到结果上限' : ''}</footer>
      </section>
    </main>
    {risk && <RiskDialog risk={risk} onCancel={() => setRisk(null)} onConfirm={(target) => void run({confirmed:true, confirmationTarget:target})} />}
    {connectionDialog && <ConnectionDialog saved={connectionDialog === 'new' ? undefined : connectionDialog} onCancel={() => setConnectionDialog(null)} onConnect={connect} />}
  </div>
}

function classifyClientRisk(statement: string): QueryRisk {
  const normalized = statement.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/--.*$/gm, ' ').trim()
  const destructive = normalized.match(/^(DROP|TRUNCATE)\s+(?:TABLE|DATABASE|SCHEMA|VIEW)?\s*(?:IF\s+EXISTS\s+)?([^\s;]+)/i)
  if (destructive) return {level:'type_target', kind:destructive[1].toLowerCase(), target:destructive[2], reason:'该操作将删除数据库对象，请输入对象名称确认。'}
  if (/^(UPDATE|DELETE)\b/i.test(normalized) && !/\bWHERE\b/i.test(normalized)) return {level:'confirm', kind:'write_without_where', reason:'语句缺少 WHERE 条件，可能影响整张表。'}
  return {level:'safe'}
}

export type { ConnectionInput, MutationInput }
