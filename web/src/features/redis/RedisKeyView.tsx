import { useCallback, useEffect, useState } from 'react'
import type { APIClient } from '../../api/client'
import type { RedisKeyDetail } from '../../api/types'

export function RedisKeyView({
  api,
  connectionId,
  keyName,
}: {
  api: Pick<APIClient, 'redisGetKey' | 'redisSaveKey' | 'redisDeleteKey' | 'redisSetTTL'>
  connectionId: string
  keyName: string
}) {
  const [detail, setDetail] = useState<RedisKeyDetail | null>(null)
  const [valueJson, setValueJson] = useState('')
  const [ttl, setTTL] = useState('')
  const [message, setMessage] = useState('')

  const load = useCallback(async () => {
    try {
      const data = await api.redisGetKey(connectionId, keyName)
      setDetail(data)
      setValueJson(typeof data.value === 'string' ? data.value : JSON.stringify(data.value, null, 2))
      setTTL(String(data.ttl))
      setMessage('')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '无法读取键')
    }
  }, [api, connectionId, keyName])

  useEffect(() => { void load() }, [load])

  const save = async () => {
    if (!detail) return
    let parsed: unknown = valueJson
    if (detail.type !== 'string') {
      parsed = JSON.parse(valueJson)
    }
    await api.redisSaveKey(connectionId, keyName, {type: detail.type, value: parsed})
    void load()
  }

  return <div className="redis-key-view table-view" style={{display: 'grid', gridTemplateRows: 'auto minmax(0,1fr) auto', minHeight: 0, flex: 1}}>
    <div className="table-view-toolbar">
      <span className="table-filter-badge">{detail?.type ?? '…'}</span>
      {detail && detail.ttl >= 0 && <span className="table-sort-badge">TTL {detail.ttl}s</span>}
      <div className="table-toolbar-spacer" />
      <input value={ttl} onChange={(e) => setTTL(e.target.value)} placeholder="TTL 秒" aria-label="TTL" style={{width: 100, height: 30, padding: '0 8px'}} />
      <button type="button" className="oc-button" onClick={async () => { await api.redisSetTTL(connectionId, keyName, Number(ttl)); void load() }}>设置 TTL</button>
      <button type="button" className="oc-button danger" onClick={async () => { if (window.confirm(`删除键 ${keyName}？`)) { await api.redisDeleteKey(connectionId, keyName) } }}>删除</button>
      <button type="button" className="oc-button primary" onClick={() => void save()}>保存</button>
    </div>
    <div className="editor-pane">
      <pre style={{margin: 0, padding: 16, color: 'var(--muted)', fontSize: 11}}>{keyName}</pre>
      <textarea value={valueJson} onChange={(e) => setValueJson(e.target.value)} aria-label="键值" style={{width: '100%', height: 'calc(100% - 40px)', resize: 'none', border: 0, padding: 16, background: 'var(--bg)', color: 'var(--ink)', fontFamily: 'var(--font-mono)', fontSize: 13, lineHeight: 1.7}} />
    </div>
    <footer className="table-status">{message || (detail ? `已加载 · ${detail.durationMs}ms` : '加载中…')}</footer>
  </div>
}
