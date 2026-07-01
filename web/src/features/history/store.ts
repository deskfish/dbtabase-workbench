export type HistoryEntry = {
  id: string
  sql: string
  connectionName: string
  database?: string
  timestamp: number
  durationMs?: number
  status: 'success' | 'error'
  affectedRows?: number
  favorite?: boolean
}

type NewHistoryEntry = Omit<HistoryEntry, 'id'|'timestamp'>
const KEY = 'database-workbench:history:v1'

export function listHistory(): HistoryEntry[] {
  try { return JSON.parse(localStorage.getItem(KEY) ?? '[]') as HistoryEntry[] } catch { return [] }
}

export function addHistory(entry: NewHistoryEntry): HistoryEntry {
  const record: HistoryEntry = {...entry, id:crypto.randomUUID(), timestamp:Date.now()}
  localStorage.setItem(KEY, JSON.stringify([record, ...listHistory()].slice(0, 500)))
  return record
}

export function toggleFavorite(id: string): void {
  localStorage.setItem(KEY, JSON.stringify(listHistory().map((entry) => entry.id === id ? {...entry, favorite:!entry.favorite} : entry)))
}

export function clearHistory(): void { localStorage.removeItem(KEY) }
