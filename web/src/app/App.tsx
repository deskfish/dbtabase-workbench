import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createId } from '../lib/id'
import type { ConnectionRegistryAPI } from '../storage/connectionRegistryApi'
import type { APIClient } from '../api/client'
import type { ConnectionInput, DatabaseObject, MutationInput, QueryResult, QueryRisk } from '../api/types'
import { SqlEditor } from '../features/editor/SqlEditor'
import { RiskDialog } from '../features/editor/RiskDialog'
import { ResultGrid } from '../features/results/ResultGrid'
import { ConnectionDialog, type ConnectionOptions } from '../features/connections/ConnectionDialog'
import { ConnectionSidebar } from '../features/connections/ConnectionSidebar'
import { ProfileDialog } from '../features/connections/ProfileDialog'
import { listConnections, type SavedConnection } from '../storage/connections'
import {
  importTeamConnection,
  listTeamConnections,
  persistConnection,
  removeConnection,
  shareConnectionToTeam as shareConnectionToTeamRemote,
  syncPersonalConnections,
} from '../storage/connectionSync'
import { isTeamConnectionImported } from '../storage/teamConnectionMatch'
import type { RegistryConnection } from '../storage/registryTypes'
import { getProfile, saveProfile } from '../storage/profile'
import { applyTheme, editorThemeFor, getTheme, saveTheme, type ThemeId } from '../storage/theme'
import { addHistory, listHistory, toggleFavorite, type HistoryEntry } from '../features/history/store'
import { HistoryPanel } from '../features/history/HistoryPanel'
import { useTransactionGuard } from '../features/editor/useTransaction'
import { TableView } from '../features/table/TableView'
import {
  createQueryTab,
  createTableTab,
  defaultSelectSQL,
  qualifiedTableName,
  tableKey,
  tableTabId,
  type TableTab,
  type WorkspaceTab,
} from '../features/workspace/types'
import { prepareTableTabReload } from '../features/workspace/tableTabLoader'
import { preserveResultColumns, resolveTableColumns } from '../features/table/tableColumns'

export type WorkbenchAPI = Pick<APIClient,
  'createSession'|'connect'|'disconnect'|'listDatabases'|'switchDatabase'|'metadata'|'startQuery'|'queryResult'|'cancelQuery'|'exportCSV'|'beginTransaction'|'finishTransaction'|'mutate'
> & ConnectionRegistryAPI

export function App({api, sessionBootstrap, initialConnectionId = '', initialSQL = 'SELECT *\nFROM your_table\nLIMIT 200;'}: {api:WorkbenchAPI; sessionBootstrap?:Promise<string>; initialConnectionId?:string; initialSQL?:string}) {
  const initialQueryTab = useMemo(() => createQueryTab(initialSQL), [initialSQL])
  const [connectionId, setConnectionId] = useState(initialConnectionId)
  const [activeSavedId, setActiveSavedId] = useState('')
  const [connectingId, setConnectingId] = useState('')
  const [objects, setObjects] = useState<DatabaseObject[]>([])
  const [tabs, setTabs] = useState<WorkspaceTab[]>([initialQueryTab])
  const tabsRef = useRef(tabs)
  tabsRef.current = tabs
  const [activeTabId, setActiveTabId] = useState(initialQueryTab.id)
  const [queryTabCounter, setQueryTabCounter] = useState(2)
  const [risk, setRisk] = useState<QueryRisk | null>(null)
  const transaction = useTransactionGuard()
  const transactionId = transaction.transactionId
  const [savedConnections, setSavedConnections] = useState<SavedConnection[]>([])
  const [teamConnections, setTeamConnections] = useState<RegistryConnection[]>([])
  const [connectionDialog, setConnectionDialog] = useState<SavedConnection | 'new' | null>(null)
  const [history, setHistory] = useState<HistoryEntry[]>(() => listHistory())
  const [sessionState, setSessionState] = useState<'loading'|'ready'|'error'>('loading')
  const [nickname, setNickname] = useState(() => getProfile()?.nickname ?? '')
  const [theme, setTheme] = useState<ThemeId>(() => getTheme())
  const [profileDialog, setProfileDialog] = useState<'setup'|'edit'|null>(() => getProfile() ? null : 'setup')
  const [activeDatabase, setActiveDatabase] = useState('')
  const [databases, setDatabases] = useState<string[]>([])
  const [switchingDatabase, setSwitchingDatabase] = useState(false)
  const connected = Boolean(connectionId)
  const activeConnection = savedConnections.find((item) => item.id === activeSavedId)

  const activeTab = tabs.find((tab) => tab.id === activeTabId) ?? tabs[0]
  const activeQueryTab = activeTab?.kind === 'query' ? activeTab : null
  const activeTableTab = activeTab?.kind === 'table' ? activeTab : null
  const sql = activeQueryTab?.sql ?? ''
  const result = activeTab?.result ?? null
  const queryId = activeTab?.queryId ?? ''
  const status = activeTab?.status ?? 'idle'
  const message = activeTab?.message ?? '尚未执行查询'
  const selectedTable = activeTableTab?.table ?? null

  const updateTab = useCallback((id: string, patch: Partial<WorkspaceTab>) => {
    setTabs((current) => {
      const next = current.map((tab) => tab.id === id ? {...tab, ...patch} as WorkspaceTab : tab)
      tabsRef.current = next
      return next
    })
  }, [])

  const refreshConnections = useCallback(async () => {
    if (sessionState !== 'ready' || !nickname.trim()) {
      setSavedConnections(await listConnections())
      return
    }
    try {
      setSavedConnections(await syncPersonalConnections(api, nickname))
    } catch {
      setSavedConnections(await listConnections())
    }
  }, [api, nickname, sessionState])

  const refreshTeamConnections = useCallback(async () => {
    if (sessionState !== 'ready' || !nickname.trim()) {
      setTeamConnections([])
      return
    }
    try {
      setTeamConnections(await listTeamConnections(api, nickname))
    } catch {
      setTeamConnections([])
    }
  }, [api, nickname, sessionState])

  const initSession = useCallback(() => {
    setSessionState('loading')
    void api.createSession()
      .then(() => setSessionState('ready'))
      .catch(() => setSessionState('error'))
  }, [api])

  useEffect(() => {
    setSessionState('loading')
    void (sessionBootstrap ?? api.createSession())
      .then(() => setSessionState('ready'))
      .catch(() => setSessionState('error'))
  }, [api, sessionBootstrap])

  useEffect(() => { applyTheme(theme) }, [theme])

  useEffect(() => { void refreshConnections() }, [refreshConnections])
  useEffect(() => { void refreshTeamConnections() }, [refreshTeamConnections])

  useEffect(() => {
    const blockContextMenu = (event: MouseEvent) => {
      const target = event.target
      if (target instanceof Element && target.closest('.context-menu, .object-tree, .tree-table-button, .tree-column, .connection-item')) return
      event.preventDefault()
    }
    document.addEventListener('contextmenu', blockContextMenu)
    return () => document.removeEventListener('contextmenu', blockContextMenu)
  }, [])

  const refreshDatabases = useCallback(async (id: string) => {
    const page = await api.listDatabases(id)
    setDatabases(page.databases)
    setActiveDatabase(page.current)
  }, [api])

  useEffect(() => {
    if (!connectionId) {
      setDatabases([])
      setActiveDatabase('')
      return
    }
    void refreshDatabases(connectionId).catch(() => setDatabases([]))
    void api.metadata(connectionId).then(setObjects).catch(() => setObjects([]))
  }, [api, connectionId, refreshDatabases])

  const resetWorkspace = useCallback(() => {
    const nextQueryTab = createQueryTab(initialSQL)
    setObjects([])
    setTabs([nextQueryTab])
    setActiveTabId(nextQueryTab.id)
    setQueryTabCounter(2)
    transaction.close()
    return nextQueryTab.id
  }, [initialSQL, transaction])

  const pollQuery = useCallback(async (connection: string, id: string, timeoutMs = 45000) => {
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
      const page = await api.queryResult(connection, id)
      if (page.status === 'running') {
        await new Promise((resolve) => setTimeout(resolve, 150))
        continue
      }
      return page
    }
    throw new Error('查询超时，请点击停止后重试')
  }, [api])

  const reloadTableTab = useCallback(async (
    id: string,
    options: {
      table?: DatabaseObject
      overrides?: Partial<Pick<TableTab, 'page' | 'pageSize' | 'filterRules' | 'sort' | 'showFilter' | 'selectedRow' | 'draft'>>
      resetDraft?: boolean
    } = {},
  ) => {
    if (!connectionId) return
    const driver = activeConnection?.driver ?? 'postgres'
    const prepared = prepareTableTabReload(tabsRef.current, id, driver, options)
    if (!prepared) {
      updateTab(id, {status: 'error', message: '无法打开表标签，请重试'})
      return
    }
    const {tabs: nextTabs, snapshot} = prepared
    setTabs(nextTabs)
    tabsRef.current = nextTabs
    try {
      const query = await api.startQuery(connectionId, snapshot.sql, {transactionId: transactionId || undefined})
      updateTab(id, {queryId: query})
      const page = await pollQuery(connectionId, query)
      const previous = tabsRef.current.find((tab) => tab.id === id && tab.kind === 'table') as TableTab | undefined
      const merged = preserveResultColumns(previous?.result ?? null, page)
      updateTab(id, {
        result: merged,
        status: 'idle',
        message: `表 ${snapshot.title} · ${merged.rows?.length ?? 0} 行 · 第 ${snapshot.page} 页`,
      })
    } catch (error) {
      updateTab(id, {
        status: 'error',
        message: error instanceof Error ? error.message : '加载表数据失败',
      })
    }
  }, [activeConnection?.driver, api, connectionId, pollQuery, transactionId, updateTab])

  const loadTableData = useCallback(async (table: DatabaseObject, tabId?: string) => {
    if (!connectionId) return
    const id = tabId ?? tableTabId(table)
    setActiveTabId(id)
    await reloadTableTab(id, {table, resetDraft: true})
  }, [connectionId, reloadTableTab])

  const openQueryTab = useCallback((nextSQL: string, title?: string) => {
    const tab = createQueryTab(nextSQL, title ?? `query_${String(queryTabCounter).padStart(2, '0')}`)
    setQueryTabCounter((count) => count + 1)
    setTabs((current) => [...current, tab])
    setActiveTabId(tab.id)
  }, [queryTabCounter])

  const copyText = useCallback(async (value: string) => {
    try {
      await navigator.clipboard.writeText(value)
    } catch {
      window.prompt('复制以下内容', value)
    }
  }, [])

  const refreshMetadata = useCallback(async () => {
    if (!connectionId) return
    setObjects(await api.metadata(connectionId))
  }, [api, connectionId])

  const activateConnection = useCallback(async (input: ConnectionInput, options: ConnectionOptions & {savedId?: string}) => {
    if (sessionState !== 'ready') throw new Error('会话尚未就绪')
    if (!input.password) throw new Error('请输入数据库密码')

    const savedId = options.savedId ?? (connectionDialog && connectionDialog !== 'new' ? connectionDialog.id : createId())
    setConnectingId(savedId)

    try {
      let workspaceTabId = activeTabId
      if (connectionId) {
        await api.disconnect(connectionId)
        workspaceTabId = resetWorkspace()
      }

      const payload = input.driver === 'postgres' && !input.database.trim()
        ? {...input, database: 'postgres'}
        : input
      const result = await api.connect(payload)
      setConnectionId(result.connectionId)
      setActiveDatabase(result.database)
      setActiveSavedId(savedId)
      setConnectionDialog(null)

      if (options.save) {
        await persistConnection(api, nickname, {
          id: savedId,
          name: options.name,
          driver: payload.driver,
          host: payload.host,
          port: payload.port,
          database: result.database,
          user: payload.user,
          tlsMode: payload.tlsMode,
          password: payload.password,
          lastConnectedAt: Date.now(),
        })
        await refreshConnections()
      } else {
        const existing = savedConnections.find((item) => item.id === savedId)
        if (existing) {
          await persistConnection(api, nickname, {...existing, lastConnectedAt: Date.now()})
          await refreshConnections()
        }
      }

      await refreshDatabases(result.connectionId)
      updateTab(workspaceTabId, {message: `已连接到 ${options.name} / ${result.database}`})
    } finally {
      setConnectingId('')
    }
  }, [activeTabId, api, connectionDialog, connectionId, nickname, refreshConnections, refreshDatabases, resetWorkspace, savedConnections, sessionState, updateTab])

  const switchDatabase = useCallback(async (database: string) => {
    if (!connectionId || database === activeDatabase) return
    setSwitchingDatabase(true)
    const workspaceTabId = resetWorkspace()
    try {
      const name = await api.switchDatabase(connectionId, database)
      setActiveDatabase(name)
      setObjects(await api.metadata(connectionId))
      await refreshDatabases(connectionId)
      const saved = savedConnections.find((item) => item.id === activeSavedId)
      if (saved) {
        await persistConnection(api, nickname, {...saved, database: name, lastConnectedAt: Date.now()})
        await refreshConnections()
      }
      updateTab(workspaceTabId, {message: `已切换到数据库 ${name}`})
    } catch (error) {
      updateTab(workspaceTabId, {
        status: 'error',
        message: error instanceof Error ? error.message : '切换数据库失败',
      })
    } finally {
      setSwitchingDatabase(false)
    }
  }, [activeDatabase, activeSavedId, activeTabId, api, connectionId, nickname, refreshConnections, refreshDatabases, resetWorkspace, savedConnections, updateTab])

  const selectSavedConnection = useCallback(async (saved: SavedConnection) => {
    if (saved.id === activeSavedId && connectionId) return
    if (!saved.password) {
      setConnectionDialog(saved)
      return
    }
    try {
      await activateConnection(
        {driver: saved.driver, host: saved.host, port: saved.port, database: saved.database, user: saved.user, password: saved.password, tlsMode: saved.tlsMode},
        {name: saved.name, save: true, savedId: saved.id},
      )
    } catch (error) {
      updateTab(activeTabId, {
        status: 'error',
        message: error instanceof Error ? error.message : '连接失败',
      })
    }
  }, [activateConnection, activeSavedId, activeTabId, connectionId, updateTab])

  async function connect(input: ConnectionInput, options: ConnectionOptions) {
    const savedId = connectionDialog && connectionDialog !== 'new' ? connectionDialog.id : undefined
    await activateConnection(input, {...options, savedId})
  }

  async function removeSavedConnection(saved: SavedConnection) {
    if (!window.confirm(`确定删除连接「${saved.name}」吗？`)) return
    if (saved.id === activeSavedId && connectionId) {
      await api.disconnect(connectionId)
      setConnectionId('')
      setActiveSavedId('')
      resetWorkspace()
    }
    await removeConnection(api, nickname, saved.id)
    await refreshConnections()
    updateTab(activeTabId, {message: `已删除连接 ${saved.name}`})
  }

  async function handleShareConnectionToTeam(saved: SavedConnection) {
    if (!nickname.trim()) {
      setProfileDialog('setup')
      return
    }
    try {
      await shareConnectionToTeamRemote(api, nickname, saved.id)
      await refreshTeamConnections()
      updateTab(activeTabId, {message: `已将「${saved.name}」共享到团队`})
    } catch (error) {
      updateTab(activeTabId, {
        status: 'error',
        message: error instanceof Error ? error.message : '共享到团队失败',
      })
    }
  }

  async function importTeamConnectionToPersonal(team: RegistryConnection) {
    if (!nickname.trim()) {
      setProfileDialog('setup')
      return
    }
    if (isTeamConnectionImported(savedConnections, team)) {
      updateTab(activeTabId, {message: `「${team.name}」已在个人连接中（${team.host}:${team.port}）`})
      return
    }
    try {
      await importTeamConnection(api, nickname, team.id)
      await refreshConnections()
      updateTab(activeTabId, {message: `已导入团队连接「${team.name}」到个人列表`})
    } catch (error) {
      updateTab(activeTabId, {
        status: 'error',
        message: error instanceof Error ? error.message : '导入团队连接失败',
      })
    }
  }

  const run = useCallback(async (confirmation?: {confirmed:boolean; confirmationTarget?:string}) => {
    if (!connectionId || !activeQueryTab || !sql.trim()) return
    const active = savedConnections.find((item) => item.id === activeSavedId)
    const tabId = activeQueryTab.id
    setRisk(null)
    updateTab(tabId, {status: 'running', message: '正在执行…', result: null, queryId: ''})
    try {
      const id = await api.startQuery(connectionId, sql, {...confirmation, transactionId: transactionId || undefined})
      updateTab(tabId, {queryId: id})
      const page = await pollQuery(connectionId, id)
      updateTab(tabId, {
        result: page,
        status: 'idle',
        resultTab: 'result',
        message: `完成 · ${page.rows?.length ?? 0} 行 · ${page.durationMs} ms`,
      })
      addHistory({sql, connectionName: active?.name ?? '当前连接', durationMs: page.durationMs, status:'success', affectedRows: page.affectedRows})
      setHistory(listHistory())
    } catch (error) {
      updateTab(tabId, {
        status: 'error',
        message: error instanceof Error ? error.message : '查询执行失败',
      })
      addHistory({sql, connectionName: active?.name ?? '当前连接', status:'error'})
      setHistory(listHistory())
    }
  }, [activeQueryTab, activeSavedId, api, connectionId, pollQuery, savedConnections, sql, transactionId, updateTab])

  const execute = useCallback(() => {
    const detected = classifyClientRisk(sql)
    if (detected.level !== 'safe') { setRisk(detected); return }
    void run()
  }, [run, sql])

  async function exportResult() {
    if (!result) return
    const blob = await api.exportCSV(connectionId, result.queryId)
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = activeTableTab ? `${activeTableTab.title}.csv` : 'query-result.csv'
    anchor.click()
    URL.revokeObjectURL(url)
  }

  function closeTab(tabId: string) {
    if (tabs.length === 1) return
    setTabs((current) => {
      const next = current.filter((tab) => tab.id !== tabId)
      if (activeTabId === tabId) {
        const index = current.findIndex((tab) => tab.id === tabId)
        const fallback = next[Math.max(0, index - 1)] ?? next[0]
        setActiveTabId(fallback.id)
      }
      return next
    })
  }

  const transactionLabel = transactionId ? '事务进行中' : '自动提交'
  const columns = useMemo(() => {
    if (activeTableTab) return resolveTableColumns(activeTableTab.table, result, objects)
    return (result?.columns ?? []).map((column) => ({name: column.name, dataType: column.databaseType}))
  }, [activeTableTab, objects, result])
  const rows = result?.rows ?? []
  const selectedTableKey = selectedTable ? tableKey(selectedTable) : ''

  return <div className="app-shell">
    <a className="skip-link" href="#sql-editor">跳到 SQL 编辑器</a>

    <ConnectionSidebar
      nickname={nickname || '访客'}
      savedConnections={savedConnections}
      teamConnections={teamConnections}
      activeSavedId={activeSavedId}
      connected={connected}
      connectingId={connectingId}
      activeDriver={activeConnection?.driver ?? ''}
      activeDatabase={activeDatabase}
      databases={databases}
      switchingDatabase={switchingDatabase}
      objects={objects}
      onEditProfile={() => setProfileDialog('edit')}
      onNewConnection={() => setConnectionDialog('new')}
      onSelectConnection={(saved) => void selectSavedConnection(saved)}
      onEditConnection={(saved) => setConnectionDialog(saved)}
      onDeleteConnection={(saved) => void removeSavedConnection(saved)}
      onShareConnectionToTeam={(saved) => void handleShareConnectionToTeam(saved)}
      onImportTeamConnection={(team) => void importTeamConnectionToPersonal(team)}
      onSwitchDatabase={(database) => void switchDatabase(database)}
      onOpenTable={(table) => void loadTableData(table)}
      onNewQueryFromTable={(table) => openQueryTab(defaultSelectSQL(table, activeConnection?.driver ?? 'postgres'), `${qualifiedTableName(table)} · 查询`)}
      onCopyTableName={(table) => void copyText(qualifiedTableName(table))}
      onRefreshTable={(table) => {
        void refreshMetadata()
        void reloadTableTab(tableTabId(table), {table})
      }}
      onCopyColumnName={(table, column) => void copyText(column.name)}
      onNewQueryFromColumn={(table, column) => openQueryTab(
        `SELECT ${column.name}\nFROM ${qualifiedTableName(table)}\nLIMIT 200;`,
        `${qualifiedTableName(table)} · ${column.name}`,
      )}
      selectedTableKey={selectedTableKey}
    />

    <main className={`workspace ${activeTab?.kind === 'table' ? 'mode-table' : 'mode-query'}`}>
      <div className="status-rail" aria-hidden="true" />
      <nav className="tabbar" aria-label="工作区标签页">
        {tabs.map((tab) => <button
          key={tab.id}
          type="button"
          className={`tab ${tab.id === activeTabId ? 'active' : ''} ${tab.kind === 'table' ? 'tab-table' : 'tab-query'}`}
          onClick={() => {
            setActiveTabId(tab.id)
            if (tab.kind === 'table' && tab.status !== 'running' && !tab.result) {
              void reloadTableTab(tab.id, {table: tab.table})
            }
          }}
        >
          <span>{tab.title}</span>
          <i
            role="button"
            aria-label={`关闭 ${tab.title}`}
            onClick={(event) => {
              event.stopPropagation()
              closeTab(tab.id)
            }}
          >×</i>
        </button>)}
        <button type="button" className="new-tab" aria-label="新建查询标签" onClick={() => openQueryTab(initialSQL)}>＋</button>
      </nav>

      {activeTab?.kind === 'table' && <>
        <section className="table-pane" aria-label="表数据">
          <TableView
            schema={activeTab.table.schema}
            table={activeTab.table.name}
            columns={columns}
            rows={rows}
            uniqueKey={objects.filter((object) => object.kind === 'key' && object.schema === activeTab.table.schema && object.parent === activeTab.table.name).map((object) => object.name)}
            sql={activeTab.sql}
            status={status}
            message={message}
            page={activeTab.page}
            pageSize={activeTab.pageSize}
            filterRules={activeTab.filterRules}
            sort={activeTab.sort}
            showFilter={activeTab.showFilter}
            selectedRow={activeTab.selectedRow}
            draft={activeTab.draft}
            truncated={result?.truncated}
            onSelectRow={(selectedRow) => updateTab(activeTab.id, {selectedRow})}
            onPageChange={(page) => void reloadTableTab(activeTab.id, {overrides: {page, selectedRow: null}, resetDraft: true})}
            onPageSizeChange={(pageSize) => void reloadTableTab(activeTab.id, {overrides: {page: 1, pageSize, selectedRow: null}, resetDraft: true})}
            onFiltersApply={(filterRules) => void reloadTableTab(activeTab.id, {overrides: {filterRules, page: 1, selectedRow: null}, resetDraft: true})}
            onFiltersClear={() => void reloadTableTab(activeTab.id, {overrides: {filterRules: [], page: 1, selectedRow: null}, resetDraft: true})}
            onSortChange={(sort) => void reloadTableTab(activeTab.id, {overrides: {sort, page: 1, selectedRow: null}, resetDraft: true})}
            onToggleFilter={() => updateTab(activeTab.id, {showFilter: !activeTab.showFilter})}
            onRefresh={() => void reloadTableTab(activeTab.id, {overrides: {selectedRow: null}, resetDraft: true})}
            onStop={() => {
              if (queryId) void api.cancelQuery(connectionId, queryId)
            }}
            onDraftChange={(draft) => updateTab(activeTab.id, {draft})}
            onApply={async () => { await reloadTableTab(activeTab.id, {overrides: {selectedRow: null}, resetDraft: true}) }}
            onDiscard={() => updateTab(activeTab.id, {draft: null, selectedRow: null})}
            onExport={() => void exportResult()}
            onSaveError={(saveError) => updateTab(activeTab.id, {status: 'error', message: saveError})}
            onMutate={async (operation, input) => {
              await api.mutate(connectionId, operation, {...input, transactionId: transactionId || undefined})
            }}
          />
        </section>
      </>}

      {activeTab?.kind === 'query' && <>
        <div className="query-toolbar">
          <button type="button" aria-label="执行 SQL" className="button primary" onClick={execute} disabled={!connected || status === 'running'}>▶ 执行 SQL</button>
          <button type="button" aria-label="停止查询" className="button ghost" disabled={!queryId || status !== 'running'} onClick={() => void api.cancelQuery(connectionId, queryId)}>■ 停止</button>
          <span className="toolbar-separator" />
          <button type="button" className="button ghost" onClick={async () => transaction.open(await api.beginTransaction(connectionId))} disabled={!connected || Boolean(transactionId)}>开始事务</button>
          <button type="button" className="button ghost" onClick={async () => {await api.finishTransaction(connectionId, transactionId, 'commit'); transaction.close()}} disabled={!transactionId}>提交</button>
          <button type="button" className="button ghost" onClick={async () => {await api.finishTransaction(connectionId, transactionId, 'rollback'); transaction.close()}} disabled={!transactionId}>回滚</button>
          <span className={`transaction-state ${transactionId ? 'open' : ''}`}>{transactionLabel}</span>
        </div>
        <section id="sql-editor" className="editor-pane" aria-label="SQL 编辑区">
          <SqlEditor value={sql} editorTheme={editorThemeFor(theme)} onChange={(value) => updateTab(activeTab.id, {sql: value})} onExecute={execute} />
        </section>
        <section className="results-pane" aria-label="查询结果">
          <div className="results-tabs">
            <button className={activeTab.resultTab === 'result' ? 'active' : ''} onClick={() => updateTab(activeTab.id, {resultTab: 'result'})}>查询结果</button>
            <button className={activeTab.resultTab === 'history' ? 'active' : ''} onClick={() => updateTab(activeTab.id, {resultTab: 'history'})}>历史</button>
            <span />
            <button className={!result ? 'disabled' : ''} disabled={!result} onClick={() => void exportResult()}>导出 CSV</button>
          </div>
          {activeTab.resultTab === 'history'
            ? <HistoryPanel entries={history} onSelect={(value) => {updateTab(activeTab.id, {sql: value, resultTab: 'result'})}} onFavorite={(id) => {toggleFavorite(id); setHistory(listHistory())}} />
            : <ResultGrid columns={columns} rows={rows} />}
          <footer className={`execution-status ${status}`} aria-live="polite"><span />{message}{result?.truncated ? ' · 已达到结果上限' : ''}</footer>
        </section>
      </>}
    </main>

    {risk && <RiskDialog risk={risk} onCancel={() => setRisk(null)} onConfirm={(target) => void run({confirmed:true, confirmationTarget:target})} />}
    {connectionDialog && <ConnectionDialog sessionState={sessionState} onRetrySession={initSession} saved={connectionDialog === 'new' ? undefined : connectionDialog} onCancel={() => setConnectionDialog(null)} onConnect={connect} />}
    {profileDialog && <ProfileDialog
      initialNickname={nickname}
      initialTheme={theme}
      onCancel={profileDialog === 'edit' ? () => setProfileDialog(null) : undefined}
      onSave={({nickname: nextNickname, theme: nextTheme}) => {
        saveProfile({nickname: nextNickname})
        saveTheme(nextTheme)
        setNickname(nextNickname)
        setTheme(nextTheme)
        setProfileDialog(null)
        void refreshConnections()
        void refreshTeamConnections()
      }}
    />}
  </div>
}

function classifyClientRisk(statement: string): QueryRisk {
  const normalized = statement.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/--.*$/gm, ' ').trim()
  const destructive = normalized.match(/^(DROP|TRUNCATE)\s+(?:TABLE|DATABASE|SCHEMA|VIEW)?\s*(?:IF\s+EXISTS\s+)?([^\s;]+)/i)
  if (destructive) return {level:'type_target', kind:destructive[1].toLowerCase(), target:destructive[2], reason:'该操作将删除数据库对象，请输入对象名称确认。'}
  if (/^(UPDATE|DELETE)\b/i.test(normalized) && !/\bWHERE\b/i.test(normalized)) return {level:'confirm', kind:'write_without_where', reason:'语句缺少 WHERE 条件，可能影响整张表。'}
  return {level:'safe'}
}

export type { ConnectionInput, MutationInput }
