import { useCallback, useEffect, useState } from 'react'
import type { APIClient } from '../../api/client'
import type { MongoCollectionDetail } from '../../api/types'

export function MongoCollectionSchema({
  api,
  connectionId,
  collection,
}: {
  api: Pick<APIClient, 'mongoCollectionDetail' | 'mongoCreateIndex' | 'mongoDropIndex'>
  connectionId: string
  collection: string
}) {
  const [detail, setDetail] = useState<MongoCollectionDetail | null>(null)
  const [message, setMessage] = useState('')
  const [indexName, setIndexName] = useState('')
  const [indexField, setIndexField] = useState('_id')
  const [indexUnique, setIndexUnique] = useState(false)

  const load = useCallback(async () => {
    try {
      setDetail(await api.mongoCollectionDetail(connectionId, collection))
      setMessage('')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '无法加载集合结构')
    }
  }, [api, collection, connectionId])

  useEffect(() => { void load() }, [load])

  return <div className="schema-workspace mongo-schema-workspace">
    <div className="table-view-toolbar">
      <span className="table-sort-badge">采样推断字段 · 非固定 Schema</span>
      <div className="table-toolbar-spacer" />
      <input value={indexField} onChange={(e) => setIndexField(e.target.value)} placeholder="索引字段" aria-label="索引字段" style={{height: 30, padding: '0 8px'}} />
      <input value={indexName} onChange={(e) => setIndexName(e.target.value)} placeholder="索引名（可选）" aria-label="索引名" style={{height: 30, padding: '0 8px'}} />
      <label style={{display: 'flex', alignItems: 'center', gap: 6, fontSize: 11}}><input type="checkbox" checked={indexUnique} onChange={(e) => setIndexUnique(e.target.checked)} />唯一</label>
      <button type="button" className="button primary" onClick={async () => {
        await api.mongoCreateIndex(connectionId, collection, {[indexField]: 1}, indexUnique, indexName || undefined)
        void load()
      }}>新建索引</button>
    </div>
    <div className="result-scroll table-grid-scroll mongo-schema-scroll">
      {message && <p className="form-error">{message}</p>}
      <h3 style={{fontSize: 12, margin: '0 0 8px'}}>推断字段 {detail?.estimatedDocs != null && <small style={{color: 'var(--muted)'}}>· 约 {detail.estimatedDocs} 文档</small>}</h3>
      <table className="result-grid" style={{marginBottom: 16}}>
        <thead><tr><th>字段路径</th><th>类型</th><th>出现率</th></tr></thead>
        <tbody>{detail?.fields.map((field) => <tr key={field.path}><td>{field.path}</td><td>{field.type}</td><td>{Math.round(field.occurrence * 100)}%</td></tr>)}</tbody>
      </table>
      <h3 style={{fontSize: 12, margin: '0 0 8px'}}>索引</h3>
      <table className="result-grid">
        <thead><tr><th>名称</th><th>字段</th><th>唯一</th><th /></tr></thead>
        <tbody>{detail?.indexes.map((index) => <tr key={index.name}><td>{index.name}</td><td>{index.keys.join(', ')}</td><td>{index.unique ? '是' : '否'}</td><td>{index.name !== '_id_' && <button type="button" className="button danger" onClick={async () => { await api.mongoDropIndex(connectionId, collection, index.name); void load() }}>删除</button>}</td></tr>)}</tbody>
      </table>
    </div>
  </div>
}
