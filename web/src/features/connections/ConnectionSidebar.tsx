import { useCallback, useMemo, useState, type PointerEvent as ReactPointerEvent } from 'react'
import type { APIClient } from '../../api/client'
import type { DriverId } from '../../api/driver'
import { isMongoDriver, isRedisDriver, isSqlDriver } from '../../api/driver'
import type { DatabaseObject } from '../../api/types'
import type { SavedConnection } from '../../storage/connections'
import type { RegistryConnection } from '../../storage/registryTypes'
import { dedupeTeamConnections } from '../../storage/teamConnectionMatch'
import { ContextMenu, type ContextMenuItem } from '../ui/ContextMenu'
import { DatabaseSwitcher } from './DatabaseSwitcher'
import { DriverBadge } from './DriverBadge'
import { ObjectTree } from '../explorer/ObjectTree'
import { RedisKeyTree } from '../redis/RedisKeyTree'
import { Icon } from '../ui/Icon'
import { TeamConnectionsDialog } from './TeamConnectionsDialog'

export function ConnectionSidebar({
  nickname,
  savedConnections,
  teamConnections,
  activeSavedId,
  connected,
  connectingId,
  activeDriver,
  activeDatabase,
  databases,
  switchingDatabase,
  objects,
  connectionBarCollapsed = false,
  onToggleConnectionBar,
  catalogWidth = 260,
  onCatalogWidthChange,
  onEditProfile,
  onNewConnection,
  onSelectConnection,
  onEditConnection,
  onDeleteConnection,
  onShareConnectionToTeam,
  onCopyTeamConnection,
  onSwitchDatabase,
  onCreateDatabase,
  onCreateTable,
  onDeleteDatabase,
  onOpenTable,
  onOpenTableStructure,
  onNewQuery,
  onDeleteTable,
  selectedTableKey = '',
  selectedRedisKey = '',
  connectionId = '',
  api,
  onOpenRedisKey,
  onOpenRedisConsole,
}: {
  nickname: string
  savedConnections: SavedConnection[]
  teamConnections: RegistryConnection[]
  activeSavedId: string
  connected: boolean
  connectingId: string
  activeDriver: DriverId | ''
  activeDatabase: string
  databases: string[]
  switchingDatabase: boolean
  objects: DatabaseObject[]
  connectionId?: string
  api?: Pick<APIClient, 'redisScanKeys'>
  connectionBarCollapsed?: boolean
  onToggleConnectionBar?: () => void
  catalogWidth?: number
  onCatalogWidthChange?: (width: number) => void
  onEditProfile: () => void
  onNewConnection: () => void
  onSelectConnection: (saved: SavedConnection) => void
  onEditConnection: (saved: SavedConnection) => void
  onDeleteConnection: (saved: SavedConnection) => void
  onShareConnectionToTeam: (saved: SavedConnection) => void
  onCopyTeamConnection: (teamId: string) => void
  onSwitchDatabase: (database: string) => void
  onCreateDatabase: (saved: SavedConnection) => void
  onCreateTable: (database: string) => void
  onDeleteDatabase: (database: string) => void
  onOpenTable: (table: DatabaseObject) => void
  onOpenTableStructure: (table: DatabaseObject) => void
  onNewQuery: (table: DatabaseObject) => void
  onDeleteTable: (table: DatabaseObject) => void
  onOpenRedisKey?: (key: string) => void
  onOpenRedisConsole?: () => void
  selectedTableKey?: string
  selectedRedisKey?: string
}) {
  const teamConnectionCount = useMemo(() => dedupeTeamConnections(teamConnections).length, [teamConnections])
  const tableCount = objects.filter((item) => item.kind === 'table').length
  const objectLabel = isMongoDriver(activeDriver) ? '集合' : isRedisDriver(activeDriver) ? '键' : '表'
  const objectCountLabel = isRedisDriver(activeDriver) ? 'SCAN 浏览' : `${tableCount} ${objectLabel}`
  const [teamOpen, setTeamOpen] = useState(false)
  const [connectionSearch, setConnectionSearch] = useState('')
  const [connectionMenu, setConnectionMenu] = useState<{saved: SavedConnection; x: number; y: number} | null>(null)

  const startCatalogResize = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (!onCatalogWidthChange) return
    event.preventDefault()
    const handle = event.currentTarget
    const startX = event.clientX
    const startWidth = catalogWidth
    handle.setPointerCapture(event.pointerId)

    const onMove = (moveEvent: PointerEvent) => {
      onCatalogWidthChange(Math.min(520, Math.max(180, startWidth + (moveEvent.clientX - startX))))
    }

    const onUp = () => {
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      handle.releasePointerCapture(event.pointerId)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }

    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }, [catalogWidth, onCatalogWidthChange])
  const openConnectionMenu = useCallback((saved: SavedConnection, anchor: HTMLElement) => {
    const rect = anchor.getBoundingClientRect()
    setConnectionMenu({saved, x: rect.right, y: rect.bottom})
  }, [])
  const canCreateDatabase = Boolean(connectionMenu && connectionMenu.saved.id === activeSavedId && connected)
  const connectionMenuItems: ContextMenuItem[] = connectionMenu
    ? [
      {label: '新建数据库', action: () => onCreateDatabase(connectionMenu.saved), disabled: !canCreateDatabase},
      {separator: true},
      {label: '共享到团队', action: () => onShareConnectionToTeam(connectionMenu.saved)},
      {separator: true},
      {label: '编辑连接', action: () => onEditConnection(connectionMenu.saved)},
      {label: '删除连接', action: () => onDeleteConnection(connectionMenu.saved)},
    ]
    : []
  const activeConnection = savedConnections.find((item) => item.id === activeSavedId)
  const visibleConnections = useMemo(() => {
    const query = connectionSearch.trim().toLowerCase()
    if (!query) return savedConnections
    return savedConnections.filter((item) => [item.name, item.host, item.database, item.user, item.driver]
      .some((value) => value.toLowerCase().includes(query)))
  }, [connectionSearch, savedConnections])

  return <><aside className={`sidebar navicat-sidebar connection-sidebar ${connectionBarCollapsed ? 'collapsed' : ''}`} aria-label="连接导航">
    {!connectionBarCollapsed && <div className="connection-panel">
      <div className="panel-heading connection-panel-heading">
        <div><span>个人连接</span><small>{savedConnections.length} 个连接</small></div>
        <div className="connection-heading-actions">
          <button type="button" className="team-entry" onClick={()=>setTeamOpen(true)}>团队连接 <b>{teamConnectionCount}</b></button>
        </div>
      </div>
      <label className="connection-search">
        <Icon name="search" />
        <input type="search" aria-label="搜索个人连接" placeholder="搜索个人连接 / 主机 / 数据库" value={connectionSearch} onChange={(event) => setConnectionSearch(event.target.value)} />
      </label>
      <div className="connection-list" role="list">
        {savedConnections.length === 0 && <div className="empty-state compact">还没有保存的连接，请使用下方工具栏新建</div>}
        {savedConnections.length > 0 && visibleConnections.length === 0 && <div className="empty-state compact">没有匹配的个人连接</div>}
        {visibleConnections.map((saved) => {
          const active = saved.id === activeSavedId
          const busy = connectingId === saved.id
          const online = active && connected && !busy
          return <div
            key={saved.id}
            className={`connection-card ${active ? 'active' : ''} ${busy ? 'busy' : ''}`}
            role="listitem"
            onContextMenu={(event) => {
              event.preventDefault()
              setConnectionMenu({saved, x: event.clientX, y: event.clientY})
            }}
          >
            <button
              type="button"
              className="connection-card-main"
              aria-label={`连接 ${saved.name}`}
              aria-current={active ? 'true' : undefined}
              disabled={Boolean(connectingId) && !busy}
              onClick={() => onSelectConnection(saved)}
            >
              <div className="connection-card-head">
                <span className={`connection-dot ${online ? 'online' : saved.driver}`} aria-hidden="true" />
                <strong className="connection-card-name">{saved.name}</strong>
                <DriverBadge driver={saved.driver} />
              </div>
              <div className="connection-card-foot">
                <span className="connection-card-host">{saved.host}:{saved.port}</span>
                {busy && <span className="connection-card-status">连接中…</span>}
                {online && <span className="connection-card-status online">已连接</span>}
              </div>
            </button>
            <button
              type="button"
              className="connection-card-menu"
              aria-label={`${saved.name} 更多操作`}
              onClick={(event) => {
                event.stopPropagation()
                openConnectionMenu(saved, event.currentTarget)
              }}
            >
              <Icon name="more-vertical" />
            </button>
          </div>
        })}
      </div>
      <footer className="connection-footer" aria-label="连接操作">
        <button type="button" aria-label="新建连接" title="新建连接" onClick={onNewConnection}><Icon name="plus" /></button>
        <button type="button" aria-label="编辑当前连接" title="编辑当前连接" disabled={!activeConnection} onClick={() => activeConnection && onEditConnection(activeConnection)}><Icon name="edit" /></button>
        <button type="button" aria-label="分享当前连接" title="分享当前连接" disabled={!activeConnection} onClick={() => activeConnection && onShareConnectionToTeam(activeConnection)}><Icon name="share" /></button>
        <button type="button" aria-label="删除当前连接" title="删除当前连接" disabled={!activeConnection} onClick={() => activeConnection && onDeleteConnection(activeConnection)}><Icon name="trash" /></button>
        <button type="button" aria-label="个人设置" title="个人设置" onClick={onEditProfile}><Icon name="settings" /></button>
      </footer>
    </div>}
    </aside>
    <div className="sidebar-split-rail">
      <button
        type="button"
        className={`sidebar-edge-toggle ${connectionBarCollapsed ? 'is-collapsed' : 'is-expanded'}`}
        aria-label={connectionBarCollapsed ? '展开连接栏' : '收起连接栏'}
        title={connectionBarCollapsed ? '展开连接栏' : '收起连接栏'}
        onClick={onToggleConnectionBar}
      ><Icon name={connectionBarCollapsed ? 'chevron-right' : 'chevron-left'} /></button>
    </div>
    {connected && <aside className="sidebar catalog-sidebar" aria-label="数据库目录">
    {activeDriver && <DatabaseSwitcher
      driver={activeDriver}
      current={activeDatabase}
      databases={databases}
      busy={switchingDatabase || Boolean(connectingId)}
      onSwitch={onSwitchDatabase}
      onCreateTable={onCreateTable}
      onDeleteDatabase={onDeleteDatabase}
    />}

    <div className="object-panel">
      <div className="panel-heading">
        <div><span>对象</span><small>{`${objectCountLabel} · ${activeDatabase}`}</small></div>
        {isRedisDriver(activeDriver) && onOpenRedisConsole && <button type="button" className="button compact" onClick={onOpenRedisConsole}>命令台</button>}
      </div>
      {switchingDatabase
        ? <div className="empty-state compact">正在切换数据库…</div>
        : isRedisDriver(activeDriver) && api && onOpenRedisKey
          ? <RedisKeyTree api={api} connectionId={connectionId} selectedKey={selectedRedisKey} onOpenKey={(item) => onOpenRedisKey(item.key)} />
          : <ObjectTree
          objects={objects}
          objectLabel={objectLabel}
          onOpenTable={onOpenTable}
          onOpenTableStructure={onOpenTableStructure}
          onNewQuery={onNewQuery}
          onDeleteTable={onDeleteTable}
          selectedTableKey={selectedTableKey}
          sqlFeatures={isSqlDriver(activeDriver)}
        />}
    </div>
    <div
      className="catalog-resize-handle"
      role="separator"
      aria-orientation="vertical"
      aria-label="调整目录栏宽度"
      onPointerDown={startCatalogResize}
    />
    </aside>}
    {connectionMenu && <ContextMenu x={connectionMenu.x} y={connectionMenu.y} items={connectionMenuItems} onClose={() => setConnectionMenu(null)} />}
    {teamOpen && <TeamConnectionsDialog connections={teamConnections} personalConnections={savedConnections} onCopy={onCopyTeamConnection} onClose={()=>setTeamOpen(false)}/>}
  </>
}
