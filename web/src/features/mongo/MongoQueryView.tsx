import { useState } from 'react'
import type { APIClient } from '../../api/client'
import type { MongoFindResult } from '../../api/types'
import { ResultGrid } from '../results/ResultGrid'

const defaultPipeline = `[
  { "$match": { "status": "paid" } },
  { "$limit": 50 }
]`

export function MongoQueryView({
  api,
  connectionId,
  database,
  collection,
}: {
  api: Pick<APIClient, 'mongoAggregate'>
  connectionId: string
  database: string
  collection: string
}) {
  const [pipeline, setPipeline] = useState(defaultPipeline)
  const [result, setResult] = useState<MongoFindResult | null>(null)
  const [status, setStatus] = useState<'idle' | 'running' | 'error'>('idle')
  const [message, setMessage] = useState('尚未执行聚合查询')

  const run = async () => {
    setStatus('running')
    try {
      const data = await api.mongoAggregate(connectionId, {database, collection, pipeline})
      setResult(data)
      setStatus('idle')
      setMessage(`${data.rows.length} 行 · ${data.durationMs}ms`)
    } catch (error) {
      setStatus('error')
      setMessage(error instanceof Error ? error.message : '聚合查询失败')
    }
  }

  return <div className="mongo-query-view">
    <div className="query-toolbar">
      <button type="button" className="button primary button-with-icon" onClick={() => void run()} disabled={status === 'running'}>运行聚合</button>
      <span className="table-sort-badge">{collection}</span>
    </div>
    <section className="editor-pane"><textarea value={pipeline} onChange={(e) => setPipeline(e.target.value)} aria-label="Aggregation pipeline" style={{width: '100%', height: '100%', resize: 'none', border: 0, padding: 16, background: 'var(--bg)', color: 'var(--ink)', fontFamily: 'var(--font-mono)', fontSize: 13, lineHeight: 1.7}} /></section>
    <section className="results-pane">
      <div className="results-tabs"><button className="active">结果</button><span /></div>
      {result ? <ResultGrid columns={result.columns} rows={result.rows} /> : <div className="empty-state">聚合结果会显示在这里</div>}
      <footer className={`execution-status ${status}`}><span />{message}{result?.truncated ? ' · 已截断' : ''}</footer>
    </section>
  </div>
}
