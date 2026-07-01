import { useState } from 'react'
import type { DatabaseObject } from '../../api/types'
import type { SavedConnection } from '../../storage/connections'
import type { RegistryConnection } from '../../storage/registryTypes'
import { isTeamConnectionImported } from '../../storage/teamConnectionMatch'
import { ContextMenu, type ContextMenuItem } from '../ui/ContextMenu'
import { DatabaseSwitcher } from './DatabaseSwitcher'
import { ObjectTree } from '../explorer/ObjectTree'

const TEAM_PANEL_KEY = 'dbw-team-open'

function readTeamPanelOpen(): boolean {
  return localStorage.getItem(TEAM_PANEL_KEY) === '1'
}

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
  onEditProfile,
  onNewConnection,
  onSelectConnection,
  onEditConnection,
  onDeleteConnection,
  onShareConnectionToTeam,
  onImportTeamConnection,
  onSwitchDatabase,
  onOpenTable,
  onNewQueryFromTable,
  onCopyTableName,
  onRefreshTable,
  onCopyColumnName,
  onNewQueryFromColumn,
  selectedTableKey = '',
}: {
  nickname: string
  savedConnections: SavedConnection[]
  teamConnections: RegistryConnection[]
  activeSavedId: string
  connected: boolean
  connectingId: string
  activeDriver: 'mysql' | 'postgres' | ''
  activeDatabase: string
  databases: string[]
  switchingDatabase: boolean
  objects: DatabaseObject[]
  onEditProfile: () => void
  onNewConnection: () => void
  onSelectConnection: (saved: SavedConnection) => void
  onEditConnection: (saved: SavedConnection) => void
  onDeleteConnection: (saved: SavedConnection) => void
  onShareConnectionToTeam: (saved: SavedConnection) => void
  onImportTeamConnection: (team: RegistryConnection) => void
  onSwitchDatabase: (database: string) => void
  onOpenTable: (table: DatabaseObject) => void
  onNewQueryFromTable: (table: DatabaseObject) => void
  onCopyTableName: (table: DatabaseObject) => void
  onRefreshTable: (table: DatabaseObject) => void
  onCopyColumnName: (table: DatabaseObject, column: DatabaseObject) => void
  onNewQueryFromColumn: (table: DatabaseObject, column: DatabaseObject) => void
  selectedTableKey?: string
}) {
  const tableCount = objects.filter((item) => item.kind === 'table').length
  const [teamOpen, setTeamOpen] = useState(readTeamPanelOpen)
  const [connectionMenu, setConnectionMenu] = useState<{saved: SavedConnection; x: number; y: number} | null>(null)
  const connectionMenuItems: ContextMenuItem[] = connectionMenu
    ? [
      {label: '共享到团队', action: () => onShareConnectionToTeam(connectionMenu.saved)},
      {separator: true},
      {label: '编辑连接', action: () => onEditConnection(connectionMenu.saved)},
      {label: '删除连接', action: () => onDeleteConnection(connectionMenu.saved)},
    ]
    : []

  function toggleTeamPanel() {
    setTeamOpen((open) => {
      const next = !open
      localStorage.setItem(TEAM_PANEL_KEY, next ? '1' : '0')
      return next
    })
  }

  return <aside className="sidebar navicat-sidebar" aria-label="连接与对象导航">
    <div className="sidebar-profile">
      <button type="button" className="profile-chip" onClick={onEditProfile} title="编辑昵称与界面配色">
        <span className="profile-avatar">{nickname.slice(0, 1).toUpperCase()}</span>
        <span className="profile-meta">
          <strong>{nickname}</strong>
          <small>{savedConnections.length} 个个人连接 · 服务端同步</small>
        </span>
      </button>
    </div>

    <div className={`connection-panel team-panel ${teamOpen ? '' : 'collapsed'}`}>
      <button type="button" className="panel-heading connection-panel-heading panel-toggle" aria-expanded={teamOpen} onClick={toggleTeamPanel}>
        <span className="panel-expand" aria-hidden="true">{teamOpen ? '▾' : '▸'}</span>
        <div>
          <span>团队连接</span>
          <small>{teamOpen ? '导入后可自行编辑维护' : '点击展开查看团队共享'}</small>
        </div>
        {teamConnections.length > 0 && <span className="panel-count">{teamConnections.length}</span>}
      </button>
      {teamOpen && <div className="connection-list team-connection-list" role="list">
        {teamConnections.length === 0 && <div className="empty-state compact">暂无团队共享连接</div>}
        {teamConnections.map((team) => {
          const imported = isTeamConnectionImported(savedConnections, team)
          return <div key={team.id} className="connection-item team-connection-item" role="listitem">
            <div className="connection-main team-connection-main">
              <span className="connection-dot team" aria-hidden="true" />
              <span className="connection-copy">
                <strong>{team.name}</strong>
                <small>{team.driver === 'postgres' ? 'PostgreSQL' : 'MySQL'} · {team.host}:{team.port}</small>
                <small>共享人 {team.sharedBy ?? '未知'} · {team.database}</small>
              </span>
            </div>
            <div className="connection-actions">
              <button
                type="button"
                className="button ghost compact team-import-button"
                disabled={imported}
                onClick={() => onImportTeamConnection(team)}
              >{imported ? '已导入' : '导入'}</button>
            </div>
          </div>
        })}
      </div>}
    </div>

    <div className="connection-panel">
      <div className="panel-heading connection-panel-heading">
        <div><span>我的连接</span><small>点击切换 · 右键共享到团队</small></div>
        <button type="button" aria-label="新建连接" className="icon-button" onClick={onNewConnection}>＋</button>
      </div>
      <div className="connection-list" role="list">
        {savedConnections.length === 0 && <div className="empty-state compact">还没有保存的连接，点击 ＋ 新建</div>}
        {savedConnections.map((saved) => {
          const active = saved.id === activeSavedId
          const busy = connectingId === saved.id
          return <div
            key={saved.id}
            className={`connection-item ${active ? 'active' : ''} ${busy ? 'busy' : ''}`}
            role="listitem"
            onContextMenu={(event) => {
              event.preventDefault()
              setConnectionMenu({saved, x: event.clientX, y: event.clientY})
            }}
          >
            <button
              type="button"
              className="connection-main"
              aria-label={`连接 ${saved.name}`}
              aria-current={active ? 'true' : undefined}
              disabled={Boolean(connectingId) && !busy}
              onClick={() => onSelectConnection(saved)}
            >
              <span className={`connection-dot ${saved.driver}`} aria-hidden="true" />
              <span className="connection-copy">
                <strong>{saved.name}</strong>
                <small>{saved.driver === 'postgres' ? 'PostgreSQL' : 'MySQL'} · {saved.host}:{saved.port}</small>
                <small>{active && connected ? activeDatabase || saved.database : saved.database || saved.user}</small>
              </span>
              {busy && <span className="connection-status">连接中…</span>}
              {active && connected && !busy && <span className="connection-status online">已连接</span>}
            </button>
            <div className="connection-actions">
              <button type="button" aria-label={`编辑 ${saved.name}`} className="icon-button tiny" onClick={() => onEditConnection(saved)}>✎</button>
              <button type="button" aria-label={`删除 ${saved.name}`} className="icon-button tiny danger" onClick={() => onDeleteConnection(saved)}>×</button>
            </div>
          </div>
        })}
      </div>
    </div>

    {connected && activeDriver && <DatabaseSwitcher
      driver={activeDriver}
      current={activeDatabase}
      databases={databases}
      busy={switchingDatabase || Boolean(connectingId)}
      onSwitch={onSwitchDatabase}
    />}

    <div className="object-panel">
      <div className="panel-heading">
        <div><span>对象</span><small>{connected ? `${tableCount} 张表 · ${activeDatabase}` : '请先选择连接'}</small></div>
      </div>
      {!connected
        ? <div className="empty-state compact">在上方选择一个连接后，这里会展示表和字段</div>
        : switchingDatabase
          ? <div className="empty-state compact">正在切换数据库…</div>
          : <ObjectTree
            objects={objects}
            onOpenTable={onOpenTable}
            onNewQueryFromTable={onNewQueryFromTable}
            onCopyTableName={onCopyTableName}
            onRefreshTable={onRefreshTable}
            onCopyColumnName={onCopyColumnName}
            onNewQueryFromColumn={onNewQueryFromColumn}
            selectedTableKey={selectedTableKey}
          />}
    </div>

    {connectionMenu && <ContextMenu x={connectionMenu.x} y={connectionMenu.y} items={connectionMenuItems} onClose={() => setConnectionMenu(null)} />}
  </aside>
}
