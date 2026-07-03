import { useState } from 'react'
import type { APIClient } from '../../api/client'
import type { RedisCommandResult } from '../../api/types'

const defaultCommands = `PING
DBSIZE
INFO keyspace`

export function RedisConsoleView({
  api,
  connectionId,
}: {
  api: Pick<APIClient, 'redisCommands'>
  connectionId: string
}) {
  const [commands, setCommands] = useState(defaultCommands)
  const [result, setResult] = useState<RedisCommandResult | null>(null)
  const [status, setStatus] = useState<'idle' | 'running' | 'error'>('idle')
  const [message, setMessage] = useState('尚未执行命令')

  const run = async () => {
    setStatus('running')
    try {
      const lines = commands.split('\n').map((line) => line.trim()).filter(Boolean)
      const data = await api.redisCommands(connectionId, lines)
      setResult(data)
      setStatus('idle')
      setMessage(`${data.results.length} 条命令 · ${data.durationMs}ms`)
    } catch (error) {
      setStatus('error')
      setMessage(error instanceof Error ? error.message : '命令执行失败')
    }
  }

  return <div className="redis-console-view" style={{display: 'grid', gridTemplateRows: 'auto minmax(160px, 42%) minmax(0, 1fr)', minHeight: 0, flex: 1}}>
    <div className="query-toolbar">
      <button type="button" className="button primary" onClick={() => void run()} disabled={status === 'running'}>执行</button>
      <span className="table-sort-badge">禁止 FLUSHALL / CONFIG / DEBUG</span>
    </div>
    <section className="editor-pane"><textarea value={commands} onChange={(e) => setCommands(e.target.value)} aria-label="Redis 命令" style={{width: '100%', height: '100%', resize: 'none', border: 0, padding: 16, background: 'var(--bg)', color: 'var(--ink)', fontFamily: 'var(--font-mono)', fontSize: 13, lineHeight: 1.7}} /></section>
    <section className="results-pane">
      <div className="results-tabs"><button className="active">结果</button><span /></div>
      <div className="result-scroll" style={{padding: 12, fontFamily: 'var(--font-mono)', fontSize: 12, lineHeight: 1.8}}>
        {result?.results.map((item, index) => <div key={index} style={{marginBottom: 12}}>
          <div style={{color: 'var(--muted)'}}>{index + 1}) {item.command}</div>
          {item.error
            ? <pre style={{margin: '4px 0 0 20px', color: 'var(--danger)'}}>{item.error}</pre>
            : <pre style={{margin: '4px 0 0 20px', whiteSpace: 'pre-wrap'}}>{typeof item.output === 'string' ? item.output : JSON.stringify(item.output, null, 2)}</pre>}
        </div>)}
        {!result && <div className="empty-state">命令结果会显示在这里</div>}
      </div>
      <footer className={`execution-status ${status}`}><span />{message}</footer>
    </section>
  </div>
}
