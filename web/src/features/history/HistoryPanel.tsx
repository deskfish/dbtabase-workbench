import type { HistoryEntry } from './store'

export function HistoryPanel({entries, onSelect, onFavorite}: {entries:HistoryEntry[]; onSelect:(sql:string)=>void; onFavorite:(id:string)=>void}) {
  if (entries.length === 0) return <div className="empty-state">执行过的 SQL 会保存在此浏览器</div>
  return <div className="history-list">{entries.map((entry) => <article key={entry.id}>
    <button type="button" onClick={() => onSelect(entry.sql)}><code>{entry.sql.replace(/\s+/g, ' ').slice(0, 90)}</code><small>{new Date(entry.timestamp).toLocaleString()} · {entry.durationMs ?? 0} ms</small></button>
    <button type="button" aria-label={entry.favorite ? '取消收藏' : '收藏'} onClick={() => onFavorite(entry.id)}>{entry.favorite ? '★' : '☆'}</button>
  </article>)}</div>
}
