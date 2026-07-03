import { useCallback, useEffect, useState } from 'react'
import type { APIClient } from '../../api/client'
import type { MongoFindResult } from '../../api/types'
import { SelectControl } from '../ui/SelectControl'

export function MongoDocumentView({
  api,
  connectionId,
  database,
  collection,
}: {
  api: Pick<APIClient, 'mongoFind' | 'mongoMutate'>
  connectionId: string
  database: string
  collection: string
}) {
  const [filter, setFilter] = useState('{}')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(200)
  const [result, setResult] = useState<MongoFindResult | null>(null)
  const [status, setStatus] = useState<'idle' | 'running' | 'error'>('idle')
  const [message, setMessage] = useState('尚未加载文档')
  const [selectedRow, setSelectedRow] = useState<number | null>(null)
  const [docJson, setDocJson] = useState('')

  const load = useCallback(async () => {
    setStatus('running')
    try {
      const data = await api.mongoFind(connectionId, {
        database,
        collection,
        filter,
        limit: pageSize,
        skip: (page - 1) * pageSize,
      })
      setResult(data)
      setSelectedRow(null)
      setStatus('idle')
      setMessage(`${collection} · ${data.rows.length} 行 · 第 ${page} 页 · ${data.durationMs}ms`)
    } catch (error) {
      setStatus('error')
      setMessage(error instanceof Error ? error.message : '加载文档失败')
    }
  }, [api, collection, connectionId, database, filter, page, pageSize])

  useEffect(() => { void load() }, [load])

  const columnNames = result?.columns.map((column) => column.name) ?? []
  const rows = result?.rows ?? []
  const selectedDoc = selectedRow != null
    ? Object.fromEntries(columnNames.map((name, index) => [name, rows[selectedRow]?.[index]]))
    : null

  useEffect(() => {
    setDocJson(selectedDoc ? JSON.stringify(selectedDoc, null, 2) : '')
  }, [selectedDoc])

  return <div className={`mongo-document-view table-view ${status === 'running' ? 'loading' : ''}`}>
    <div className="table-view-head">
      <div className="table-view-toolbar">
        <input className="search-input" style={{minWidth: 220, flex: 1}} value={filter} onChange={(e) => setFilter(e.target.value)} placeholder='Filter JSON: {"status":"paid"}' aria-label="MongoDB 筛选" />
        <button type="button" className="button" onClick={() => void load()} disabled={status === 'running'}>筛选</button>
        {result?.total != null && <span className="table-filter-badge">共 {result.total} 文档</span>}
      </div>
    </div>
    <div className="mongo-document-body">
      <div className="result-scroll table-grid-scroll mongo-document-grid">
        {columnNames.length === 0
          ? <div className="empty-state">{message}</div>
          : <table className="result-grid table-data-grid">
            <thead><tr><th>#</th>{columnNames.map((name) => <th key={name}>{name}</th>)}</tr></thead>
            <tbody>{rows.map((row, rowIndex) => <tr key={rowIndex} className={selectedRow === rowIndex ? 'selected' : ''} onClick={() => setSelectedRow(rowIndex)}>
              <th>{rowIndex + 1}</th>
              {row.map((cell, cellIndex) => <td key={cellIndex}>{cell == null ? <span className="cell-null">null</span> : typeof cell === 'object' ? JSON.stringify(cell) : String(cell)}</td>)}
            </tr>)}</tbody>
          </table>}
      </div>
      <aside className="mongo-document-editor">
        <h3 className="mongo-document-editor-title">文档 JSON</h3>
        <textarea value={docJson} onChange={(e) => setDocJson(e.target.value)} aria-label="文档 JSON" className="mongo-document-textarea" />
        <div className="mongo-document-actions">
          <button type="button" className="button primary" disabled={!selectedDoc} onClick={async () => {
            if (!selectedDoc) return
            await api.mongoMutate(connectionId, {database, collection, operation: 'replace', filter: JSON.stringify({_id: selectedDoc._id}), document: docJson})
            void load()
          }}>保存</button>
          <button type="button" className="button danger" disabled={!selectedDoc} onClick={async () => {
            if (!selectedDoc || !window.confirm('确认删除该文档？')) return
            await api.mongoMutate(connectionId, {database, collection, operation: 'delete', filter: JSON.stringify({_id: selectedDoc._id})})
            void load()
          }}>删除</button>
        </div>
      </aside>
    </div>
    <footer className="table-status">
      <div className="table-pagination">
        <button type="button" className="icon-tool tiny" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>‹</button>
        <span className="page-input"><input value={page} onChange={(e) => setPage(Number(e.target.value) || 1)} aria-label="页码" /></span>
        <button type="button" className="icon-tool tiny" onClick={() => setPage((p) => p + 1)}>›</button>
        <SelectControl ariaLabel="每页数量" value={String(pageSize)} options={[50, 100, 200, 500].map((size) => ({value: String(size), label: `${size}/页`}))} onChange={(value) => { setPageSize(Number(value)); setPage(1) }} />
      </div>
      <span>{message}{result?.truncated ? ' · 已截断' : ''}</span>
    </footer>
  </div>
}
