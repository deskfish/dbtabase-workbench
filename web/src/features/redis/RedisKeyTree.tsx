import { useCallback, useEffect, useMemo, useState } from 'react'
import type { APIClient } from '../../api/client'
import type { RedisKeySummary } from '../../api/types'
import { Icon } from '../ui/Icon'
import { buildRedisKeyTree, folderPathForKey, type RedisKeyTreeNode } from './redisKeyHierarchy'

function TypeBadge({type}: {type: string}) {
  return <span className={`type-badge ${type}`} style={{fontSize: 9, padding: '1px 5px', borderRadius: 4, background: 'var(--surface-3)'}}>{type.slice(0, 3).toUpperCase()}</span>
}

function RedisKeyTreeNodeRow({
  node,
  depth,
  expanded,
  selectedKey,
  onToggleFolder,
  onOpenKey,
}: {
  node: RedisKeyTreeNode
  depth: number
  expanded: Set<string>
  selectedKey: string
  onToggleFolder: (prefix: string) => void
  onOpenKey: (item: RedisKeySummary) => void
}) {
  const indent = depth * 14 + 8

  if (node.kind === 'key') {
    return <div className={`redis-tree-key ${selectedKey === node.item.key ? 'active' : ''}`} style={{paddingLeft: indent}}>
      <button
        type="button"
        className="tree-table-button"
        title={node.item.key}
        onClick={() => onOpenKey(node.item)}
      >
        <TypeBadge type={node.item.type} />
        <span className="mono">{node.displayName}</span>
      </button>
    </div>
  }

  const isOpen = expanded.has(node.prefix)
  return <>
    <button
      type="button"
      className="redis-tree-folder-button"
      style={{paddingLeft: indent}}
      aria-expanded={isOpen}
      onClick={() => onToggleFolder(node.prefix)}
    >
      <Icon name={isOpen ? 'chevron-down' : 'chevron-right'} />
      <span className="tree-icon" aria-hidden="true">▤</span>
      <span>{node.name}</span>
      <small>({node.count})</small>
    </button>
    {isOpen && node.children.map((child) => <RedisKeyTreeNodeRow
      key={child.kind === 'folder' ? child.prefix : child.item.key}
      node={child}
      depth={depth + 1}
      expanded={expanded}
      selectedKey={selectedKey}
      onToggleFolder={onToggleFolder}
      onOpenKey={onOpenKey}
    />)}
  </>
}

export function RedisKeyTree({
  api,
  connectionId,
  selectedKey = '',
  onOpenKey,
}: {
  api: Pick<APIClient, 'redisScanKeys'>
  connectionId: string
  selectedKey?: string
  onOpenKey: (key: RedisKeySummary) => void
}) {
  const [match, setMatch] = useState('*')
  const [cursor, setCursor] = useState(0)
  const [keys, setKeys] = useState<RedisKeySummary[]>([])
  const [loading, setLoading] = useState(false)
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set())

  const load = useCallback(async (nextCursor = 0, append = false) => {
    setLoading(true)
    try {
      const result = await api.redisScanKeys(connectionId, match, nextCursor)
      setKeys((current) => append ? [...current, ...result.keys] : result.keys)
      setCursor(result.cursor)
    } finally {
      setLoading(false)
    }
  }, [api, connectionId, match])

  useEffect(() => { void load(0, false) }, [load])

  useEffect(() => {
    if (!selectedKey) return
    setExpanded((current) => {
      const next = new Set(current)
      for (const prefix of folderPathForKey(selectedKey)) next.add(prefix)
      return next
    })
  }, [selectedKey])

  const tree = useMemo(() => buildRedisKeyTree(keys), [keys])

  const toggleFolder = useCallback((prefix: string) => {
    setExpanded((current) => {
      const next = new Set(current)
      if (next.has(prefix)) next.delete(prefix)
      else next.add(prefix)
      return next
    })
  }, [])

  return <div className="redis-key-tree">
    <div className="redis-tree-toolbar">
      <input className="search-input connection-search compact" style={{width: '100%'}} value={match} onChange={(event) => setMatch(event.target.value)} placeholder="MATCH pattern:*" aria-label="键匹配模式" />
      <button type="button" className="button" style={{width: '100%'}} onClick={() => void load(0, false)} disabled={loading}>扫描</button>
    </div>
    <div className="key-list object-tree redis-tree-body" role="tree" aria-label="Redis 键">
      {tree.map((node) => <RedisKeyTreeNodeRow
        key={node.kind === 'folder' ? node.prefix : node.item.key}
        node={node}
        depth={0}
        expanded={expanded}
        selectedKey={selectedKey}
        onToggleFolder={toggleFolder}
        onOpenKey={onOpenKey}
      />)}
      {keys.length === 0 && !loading && <div className="empty-state compact">没有匹配的键</div>}
    </div>
    {cursor !== 0 && <div className="redis-tree-footer">
      <button type="button" className="button" style={{flex: '1 1 auto'}} onClick={() => void load(cursor, true)} disabled={loading}>加载更多</button>
    </div>}
  </div>
}
