import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {Link} from 'react-router-dom'
import type { APIClient } from '../api/client'
import type { ConnectionInput, DatabaseObject, MutationInput, QueryResult, QueryRisk } from '../api/types'
import { SqlEditor } from '../features/editor/SqlEditor'
import type { SqlCompletionContext } from '../features/editor/sqlCompletion'
import { RiskDialog } from '../features/editor/RiskDialog'
import { ResultGrid } from '../features/results/ResultGrid'
import {DatabaseSwitcher} from '../features/connections/DatabaseSwitcher'
import {DatabaseResourceRail} from '../features/database/DatabaseResourceRail'
import {ObjectTree} from '../features/explorer/ObjectTree'
import {RedisKeyTree} from '../features/redis/RedisKeyTree'
import type {WorkbenchTarget} from '../connections/types'
import { applyTheme, editorThemeFor, getTheme, type ThemeId } from '../storage/theme'
import { addHistory, listHistory, toggleFavorite, type HistoryEntry } from '../features/history/store'
import { HistoryPanel } from '../features/history/HistoryPanel'
import { useTransactionGuard } from '../features/editor/useTransaction'
import { TableView } from '../features/table/TableView'
import { BrandMark } from '../features/ui/BrandMark'
import { Icon } from '../features/ui/Icon'
import { SelectControl } from '../features/ui/SelectControl'
import { isMongoDriver, isRedisDriver, isSqlDriver, driverLabel, sqlDriverOrDefault } from '../api/driver'
import { MongoCollectionSchema } from '../features/mongo/MongoCollectionSchema'
import { MongoDocumentView } from '../features/mongo/MongoDocumentView'
import { MongoQueryView } from '../features/mongo/MongoQueryView'
import { RedisConsoleView } from '../features/redis/RedisConsoleView'
import { RedisKeyView } from '../features/redis/RedisKeyView'
import {
  createMongoDocumentTab,
  createDefaultWorkspaceTab,
  createQueryTab,
  createRedisConsoleTab,
  createRedisKeyTab,
  createTableTab,
  defaultSelectSQL,
  qualifiedTableName,
  tableKey,
  tableTabId,
  type MongoDocumentTab,
  type TableTab,
  type WorkspaceTab,
} from '../features/workspace/types'
import { prepareTableTabReload } from '../features/workspace/tableTabLoader'
import { CreateTableDialog } from '../features/workspace/CreateTableDialog'
import { buildCreateDatabaseSQL, buildCreateTableSQL, buildDropDatabaseSQL, buildDropTableSQL, extractDropConfirmationTarget, isValidSqlIdent, type CreateTableColumn } from '../features/workspace/ddl'
import { preserveResultColumns, resolveTableColumns } from '../features/table/tableColumns'
import { SchemaWorkspace } from '../features/schema/SchemaWorkspace'
import {SQL_GUIDE,sqlForSelectedTable} from '../features/editor/sqlTemplate'
import { useCommandExtras, useUnifiedContext, useUnifiedRuntime, useUnifiedSidebar, useUnifiedStatus } from '../layout/UnifiedShellContext'

export type WorkbenchAPI = Pick<APIClient,
  'createSession'|'connectSaved'|'disconnect'|'listDatabases'|'switchDatabase'|'metadata'|'startQuery'|'queryResult'|'cancelQuery'|'exportCSV'|'beginTransaction'|'finishTransaction'|'mutate'|'tableDetail'|'previewSchema'|'executeSchema'|'capabilities'|'mongoFind'|'mongoAggregate'|'mongoMutate'|'mongoCollectionDetail'|'mongoCreateIndex'|'mongoDropIndex'|'redisScanKeys'|'redisGetKey'|'redisSaveKey'|'redisDeleteKey'|'redisSetTTL'|'redisCommands'
>

export function DatabaseWorkbench({api, connections = [], selectedConnectionId = '', onSelectConnection, sessionBootstrap, initialSQL = SQL_GUIDE}: {api:WorkbenchAPI; connections?:WorkbenchTarget[]; selectedConnectionId?:string; onSelectConnection?:(id:string)=>void; sessionBootstrap?:Promise<string>; initialSQL?:string}) {
  const initialQueryTab = useMemo(() => createQueryTab(initialSQL), [initialSQL])
  const [connectionId, setConnectionId] = useState('')
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
  const [history, setHistory] = useState<HistoryEntry[]>(() => listHistory())
  const [sessionState, setSessionState] = useState<'loading'|'ready'|'error'>('loading')
  const [theme, setTheme] = useState<ThemeId>(() => getTheme())
  const [activeDatabase, setActiveDatabase] = useState('')
  const [databases, setDatabases] = useState<string[]>([])
  const [querySchema, setQuerySchema] = useState('')
  const [queryTable, setQueryTable] = useState('')
  const [switchingDatabase, setSwitchingDatabase] = useState(false)
  const [structureTabId, setStructureTabId] = useState('')
  const [dirtySchemaTabs,setDirtySchemaTabs]=useState<Set<string>>(()=>new Set())
  const [redisConsoleCounter, setRedisConsoleCounter] = useState(2)
  const [selectedRedisKey, setSelectedRedisKey] = useState('')
  const [createTableDialog, setCreateTableDialog] = useState<{database: string} | null>(null)
  const [connectionNotice, setConnectionNotice] = useState<{tone: 'info' | 'error'; message: string} | null>(null)
  const connected = Boolean(connectionId)
  const activeConnection = connections.find((item) => item.id === activeSavedId)

  const activeTab = tabs.find((tab) => tab.id === activeTabId) ?? tabs[0]
  const activeQueryTab = activeTab?.kind === 'query' ? activeTab : null
  const activeTableTab = activeTab?.kind === 'table' ? activeTab : null
  const activeMongoTab = activeTab?.kind === 'mongo-document' ? activeTab : null
  const activeRedisKeyTab = activeTab?.kind === 'redis-key' ? activeTab : null
  const activeRedisConsoleTab = activeTab?.kind === 'redis-console' ? activeTab : null
  const activeDriverHomeTab = activeTab?.kind === 'driver-home' ? activeTab : null
  const sql = activeQueryTab?.sql ?? ''
  const result = (activeTab?.kind === 'query' || activeTab?.kind === 'table') ? activeTab.result : null
  const queryId = (activeTab?.kind === 'query' || activeTab?.kind === 'table') ? activeTab.queryId : ''
  const status = (activeTab?.kind === 'query' || activeTab?.kind === 'table') ? activeTab.status : 'idle'
  const message = (activeTab?.kind === 'query' || activeTab?.kind === 'table') ? activeTab.message : ''
  const selectedTable = activeTableTab?.table ?? null

  const updateTab = useCallback((id: string, patch: Partial<WorkspaceTab>) => {
    setTabs((current) => {
      const next = current.map((tab) => tab.id === id ? {...tab, ...patch} as WorkspaceTab : tab)
      tabsRef.current = next
      return next
    })
  }, [])

  const reportConnectionFeedback = useCallback((message: string, tone: 'info' | 'error' = 'info') => {
    setConnectionNotice({tone, message})
    const queryTab = tabsRef.current.find((tab) => tab.kind === 'query')
    if (queryTab) {
      updateTab(queryTab.id, {status: tone === 'error' ? 'error' : 'idle', message})
    }
  }, [updateTab])

  useEffect(() => {
    setSessionState('loading')
    void (sessionBootstrap ?? api.createSession())
      .then(() => setSessionState('ready'))
      .catch(() => setSessionState('error'))
  }, [api, sessionBootstrap])

  useEffect(() => { applyTheme(theme) }, [theme])

  useEffect(()=>{
    const protect=(event:BeforeUnloadEvent)=>{if(dirtySchemaTabs.size){event.preventDefault();event.returnValue=''}}
    window.addEventListener('beforeunload',protect)
    return()=>window.removeEventListener('beforeunload',protect)
  },[dirtySchemaTabs])

  useEffect(() => {
    const blockContextMenu = (event: MouseEvent) => {
      const target = event.target
      if (target instanceof Element && target.closest('.context-menu, .object-tree, .tree-table-button, .connection-item, .database-item')) return
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

  const resetWorkspace = useCallback((driver: ConnectionInput['driver'] | '' = 'mysql') => {
    const {tab, nextRedisConsoleCounter} = createDefaultWorkspaceTab(driver, initialSQL, redisConsoleCounter)
    setObjects([])
    setTabs([tab])
    setActiveTabId(tab.id)
    setQueryTabCounter(2)
    setStructureTabId('')
    setSelectedRedisKey('')
    setRedisConsoleCounter(nextRedisConsoleCounter)
    transaction.close()
    return tab.id
  }, [initialSQL, redisConsoleCounter, transaction])

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
    const driver = sqlDriverOrDefault(activeConnection?.driver ?? '')
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
    if (isMongoDriver(activeConnection?.driver ?? '')) {
      const id = tabId ?? `mongo:${table.schema ?? ''}/${table.name}`
      setTabs((current) => current.some((tab) => tab.id === id) ? current : [...current, createMongoDocumentTab(table)])
      setActiveTabId(id)
      return
    }
    const id = tabId ?? tableTabId(table)
    setActiveTabId(id)
    await reloadTableTab(id, {table, resetDraft: true})
  }, [activeConnection?.driver, connectionId, reloadTableTab])

  const openQueryTab = useCallback((nextSQL: string, title?: string) => {
    const tab = createQueryTab(nextSQL, title ?? `query_${String(queryTabCounter).padStart(2, '0')}`)
    setQueryTabCounter((count) => count + 1)
    setTabs((current) => [...current, tab])
    setActiveTabId(tab.id)
  }, [queryTabCounter])

  const openQueryForTable = useCallback((table: DatabaseObject) => {
    if (isMongoDriver(activeConnection?.driver ?? '')) {
      const id = `mongo:${table.schema ?? ''}/${table.name}`
      setTabs((current) => {
        const existing = current.find((tab) => tab.id === id && tab.kind === 'mongo-document') as MongoDocumentTab | undefined
        if (existing) return current.map((tab) => tab.id === id ? {...tab, section: 'query'} as MongoDocumentTab : tab)
        return [...current, {...createMongoDocumentTab(table), section: 'query'}]
      })
      setActiveTabId(id)
      return
    }
    const driver = sqlDriverOrDefault(activeConnection?.driver ?? '')
    setQuerySchema(table.schema ?? '')
    setQueryTable(qualifiedTableName(table))
    openQueryTab(defaultSelectSQL(table, sqlDriverOrDefault(activeConnection?.driver ?? '')))
  }, [activeConnection?.driver, openQueryTab])

  const refreshMetadata = useCallback(async () => {
    if (!connectionId) return
    setObjects(await api.metadata(connectionId))
  }, [api, connectionId])

  const executeAdminSql = useCallback(async (sql: string, successMessage: string) => {
    if (!connectionId) return false
    try {
      const confirmationTarget = extractDropConfirmationTarget(sql)
      const id = await api.startQuery(connectionId, sql, {
        ...(confirmationTarget ? {confirmed: true, confirmationTarget} : {}),
      })
      await pollQuery(connectionId, id)
      const queryTab = tabsRef.current.find((tab) => tab.kind === 'query')
      if (queryTab) updateTab(queryTab.id, {message: successMessage, status: 'idle'})
      return true
    } catch (error) {
      const message = error instanceof Error ? error.message : 'SQL 执行失败'
      window.alert(message)
      const queryTab = tabsRef.current.find((tab) => tab.kind === 'query')
      if (queryTab) updateTab(queryTab.id, {status: 'error', message})
      return false
    }
  }, [api, connectionId, pollQuery, updateTab])

  const switchDatabase = useCallback(async (database: string) => {
    if (!connectionId || database === activeDatabase) return
    setSwitchingDatabase(true)
    const workspaceTabId = resetWorkspace(activeConnection?.driver ?? 'mysql')
    try {
      const name = await api.switchDatabase(connectionId, database)
      setActiveDatabase(name)
      setObjects(await api.metadata(connectionId))
      await refreshDatabases(connectionId)
      updateTab(workspaceTabId, {message: `已切换到数据库 ${name}`})
    } catch (error) {
      updateTab(workspaceTabId, {
        status: 'error',
        message: error instanceof Error ? error.message : '切换数据库失败',
      })
    } finally {
      setSwitchingDatabase(false)
    }
  }, [activeConnection?.driver, activeDatabase, api, connectionId, refreshDatabases, resetWorkspace, updateTab])

  const handleCreateDatabase = useCallback(async () => {
    if (!connectionId || !connected) return
    const name = window.prompt('请输入新数据库名称')
    if (!name?.trim()) return
    const dbName = name.trim()
    if (!isValidSqlIdent(dbName)) {
      updateTab(activeTabId, {status: 'error', message: '名称仅支持字母、数字和下划线，且不能以数字开头'})
      return
    }
    const driver = sqlDriverOrDefault(activeConnection?.driver ?? '')
    const ok = await executeAdminSql(buildCreateDatabaseSQL(driver, dbName), `已创建数据库 ${dbName}`)
    if (ok) await refreshDatabases(connectionId)
  }, [activeConnection?.driver, activeTabId, connected, connectionId, executeAdminSql, refreshDatabases, updateTab])

  const handleCreateTable = useCallback((database: string) => {
    if (!connectionId || !connected) return
    setCreateTableDialog({database})
  }, [connected, connectionId])

  const handleCreateTableSubmit = useCallback(async (database: string, tableName: string, columns: CreateTableColumn[]) => {
    if (!connectionId || !connected) return
    const driver = sqlDriverOrDefault(activeConnection?.driver ?? '')
    setCreateTableDialog(null)
    if (database !== activeDatabase) {
      await switchDatabase(database)
    }
    const schema = driver === 'postgres' ? 'public' : database
    const ok = await executeAdminSql(buildCreateTableSQL(driver, schema, tableName, columns), `已在 ${database} 创建表 ${tableName}`)
    if (ok) await refreshMetadata()
  }, [activeConnection?.driver, activeDatabase, connected, connectionId, executeAdminSql, refreshMetadata, switchDatabase])

  const handleDeleteDatabase = useCallback(async (database: string) => {
    if (!connectionId || !connected) return
    if (!window.confirm(`确定删除数据库「${database}」吗？此操作不可恢复。`)) return
    const driver = sqlDriverOrDefault(activeConnection?.driver ?? '')
    if (database === activeDatabase) {
      const fallback = databases.find((name) => name !== database) ?? (driver === 'postgres' ? 'postgres' : '')
      if (!fallback) {
        updateTab(activeTabId, {status: 'error', message: '无法删除当前唯一的数据库'})
        return
      }
      await switchDatabase(fallback)
    }
    const ok = await executeAdminSql(buildDropDatabaseSQL(driver, database), `已删除数据库 ${database}`)
    if (ok) await refreshDatabases(connectionId)
  }, [activeConnection?.driver, activeDatabase, activeTabId, connected, connectionId, databases, executeAdminSql, refreshDatabases, switchDatabase, updateTab])

  const handleDeleteTable = useCallback(async (table: DatabaseObject) => {
    if (!connectionId || !connected) return
    const label = qualifiedTableName(table)
    if (!window.confirm(`确定删除表「${label}」吗？此操作不可恢复。`)) return
    const driver = sqlDriverOrDefault(activeConnection?.driver ?? '')
    const schema = table.schema || (driver === 'postgres' ? 'public' : activeDatabase)
    const ok = await executeAdminSql(buildDropTableSQL(driver, schema, table.name), `已删除表 ${label}`)
    if (!ok) return
    const tabId = tableTabId(table)
    setTabs((current) => current.filter((tab) => tab.id !== tabId))
    if (activeTabId === tabId) {
      const remaining = tabsRef.current.filter((tab) => tab.id !== tabId)
      setActiveTabId(remaining[0]?.id ?? activeTabId)
    }
    if (structureTabId === tabId) setStructureTabId('')
    await refreshMetadata()
  }, [activeDatabase, activeTabId, connected, connectionId, executeAdminSql, refreshMetadata, structureTabId])

  const openTableStructure = useCallback((table: DatabaseObject) => {
    if (isMongoDriver(activeConnection?.driver ?? '')) {
      const id = `mongo:${table.schema ?? ''}/${table.name}`
      setTabs((current) => {
        const existing = current.find((tab) => tab.id === id && tab.kind === 'mongo-document') as MongoDocumentTab | undefined
        if (existing) return current.map((tab) => tab.id === id ? {...tab, section: 'schema'} as MongoDocumentTab : tab)
        return [...current, {...createMongoDocumentTab(table), section: 'schema'}]
      })
      setActiveTabId(id)
      return
    }
    const id = tableTabId(table)
    const driver = sqlDriverOrDefault(activeConnection?.driver ?? '')
    setTabs((current) => current.some((tab) => tab.id === id) ? current : [...current, createTableTab(table, driver)])
    setActiveTabId(id)
    setStructureTabId(id)
  }, [activeConnection?.driver])

  const openRedisKey = useCallback((key: string) => {
    const tab = createRedisKeyTab(key)
    setSelectedRedisKey(key)
    setTabs((current) => current.some((item) => item.id === tab.id) ? current : [...current, tab])
    setActiveTabId(tab.id)
  }, [])

  const openRedisConsole = useCallback(() => {
    const tab = createRedisConsoleTab(redisConsoleCounter)
    setRedisConsoleCounter((count) => count + 1)
    setTabs((current) => [...current, tab])
    setActiveTabId(tab.id)
  }, [redisConsoleCounter])

  const selectWorkbenchConnection = useCallback(async (target: WorkbenchTarget) => {
    if (target.id === activeSavedId && connectionId) {
      reportConnectionFeedback(`已连接 ${target.name}`, 'info')
      return
    }
    if (sessionState !== 'ready') return
    setConnectingId(target.id)
    setActiveSavedId(target.id)
    try {
      if (connectionId) await api.disconnect(connectionId)
      const result = await api.connectSaved(target.id)
      const workspaceTabId = resetWorkspace(target.driver)
      setConnectionId(result.connectionId)
      setActiveDatabase(result.database)
      await refreshDatabases(result.connectionId)
      setObjects(await api.metadata(result.connectionId))
      setConnectionNotice({tone: 'info', message: `已连接到 ${target.name} / ${result.database}`})
      updateTab(workspaceTabId, {message: `已连接到 ${target.name} / ${result.database}`})
    } catch (error) {
      setConnectionId('')
      reportConnectionFeedback(error instanceof Error ? error.message : '连接失败', 'error')
    } finally {
      setConnectingId('')
    }
  }, [activeSavedId, api, connectionId, refreshDatabases, reportConnectionFeedback, resetWorkspace, sessionState, updateTab])

  useEffect(() => {
    if (!selectedConnectionId || sessionState !== 'ready' || connectingId) return
    const target = connections.find((connection) => connection.id === selectedConnectionId)
    if (!target || (activeSavedId === target.id && connectionId)) return
    void selectWorkbenchConnection(target)
  }, [activeSavedId, connectionId, connections, connectingId, selectedConnectionId, selectWorkbenchConnection, sessionState])

  const run = useCallback(async (confirmation?: {confirmed:boolean; confirmationTarget?:string}) => {
    if (!connectionId || !activeQueryTab || !sql.trim()) return
    const active = connections.find((item) => item.id === activeSavedId)
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
  }, [activeQueryTab, activeSavedId, api, connectionId, connections, pollQuery, sql, transactionId, updateTab])

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
    if(dirtySchemaTabs.has(tabId)&&!window.confirm('表结构有未保存修改，确认放弃？'))return
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
  const sqlCompletionContext = useMemo((): SqlCompletionContext | null => {
    if (!connected) return null
    const driver = sqlDriverOrDefault(activeConnection?.driver ?? '')
    const schema = querySchema || objects.find((item) => item.kind === 'table')?.schema || (driver === 'postgres' ? 'public' : activeDatabase)
    return {driver: sqlDriverOrDefault(activeConnection?.driver ?? ''), activeDatabase, defaultSchema: schema, objects}
  }, [activeConnection?.driver, activeDatabase, connected, objects, querySchema])

  const connectionStatus = (
    <>
      {connected && activeConnection && <span className="embedded-driver-label">{driverLabel(activeConnection.driver)}</span>}
      <span className={`connection-pill ${connected ? 'connected' : ''}`}><span/>{connected ? '已连接' : '未连接'}{activeConnection ? ` · ${activeConnection.name}` : ''}</span>
      {connectionNotice && <span className={`connection-notice ${connectionNotice.tone}`} role="status">{connectionNotice.message}</span>}
    </>
  )

  const objectLabel = isMongoDriver(activeConnection?.driver ?? '') ? '集合' : isRedisDriver(activeConnection?.driver ?? '') ? '键' : '表'
  const resourceCatalog = connected && activeConnection ? <div className="unified-database-catalog">
    <DatabaseSwitcher
      driver={activeConnection.driver}
      current={activeDatabase}
      databases={databases}
      busy={switchingDatabase || Boolean(connectingId)}
      onSwitch={(database) => void switchDatabase(database)}
      onCreateTable={handleCreateTable}
      onDeleteDatabase={(database) => void handleDeleteDatabase(database)}
    />
    <div className="object-panel">
      <div className="panel-heading"><div><span>对象</span><small>{objects.filter((item) => item.kind === 'table').length} {objectLabel}</small></div><div>{isSqlDriver(activeConnection.driver) && <button type="button" className="oc-button compact" onClick={() => void handleCreateDatabase()}>新建库</button>}{isRedisDriver(activeConnection.driver) && <button type="button" className="oc-button compact" onClick={openRedisConsole}>命令台</button>}</div></div>
      {isRedisDriver(activeConnection.driver)
        ? <RedisKeyTree api={api as APIClient} connectionId={connectionId} selectedKey={selectedRedisKey} onOpenKey={(item) => openRedisKey(item.key)} />
        : <ObjectTree objects={objects} objectLabel={objectLabel} sqlFeatures={isSqlDriver(activeConnection.driver)} selectedTableKey={selectedTableKey} onOpenTable={(table) => void loadTableData(table)} onOpenTableStructure={openTableStructure} onNewQuery={openQueryForTable} onDeleteTable={(table) => void handleDeleteTable(table)} />}
    </div>
  </div> : null

  const unifiedSidebar = <DatabaseResourceRail
    connections={connections}
    selectedId={selectedConnectionId || activeSavedId}
    connectingId={connectingId}
    connected={connected}
    catalog={resourceCatalog}
    onSelect={(target) => {
      onSelectConnection?.(target.id)
      if (!onSelectConnection) void selectWorkbenchConnection(target)
    }}
  />

  useUnifiedSidebar(unifiedSidebar, {
    label: '数据库',
    deps: [
      connections, selectedConnectionId, activeSavedId, connected, connectingId,
      activeConnection?.driver, activeDatabase, databases, switchingDatabase, objects, connectionId,
      selectedTableKey, selectedRedisKey,
    ],
  })
  useCommandExtras(connectionStatus, [connected, activeConnection?.name, activeConnection?.driver, connectionNotice])
  const databaseContext = <div className="database-terminal-context">
    <span className="terminal-context-kicker">RUNTIME</span><h3>{activeConnection?.name ?? '未选择连接'}</h3>
    <dl><div><dt>状态</dt><dd>{connected ? '已连接' : '离线'}</dd></div><div><dt>驱动</dt><dd>{activeConnection ? driverLabel(activeConnection.driver) : '—'}</dd></div><div><dt>数据库</dt><dd>{activeDatabase || '—'}</dd></div><div><dt>事务</dt><dd>{transactionLabel}</dd></div><div><dt>对象</dt><dd>{objects.length}</dd></div></dl>
  </div>
  useUnifiedContext(databaseContext, {label: '数据库上下文', deps: [connected, activeConnection?.name, activeConnection?.driver, activeDatabase, transactionId, objects.length]})
  useUnifiedRuntime({path: ['database', activeConnection?.name ?? 'disconnected', activeDatabase || 'workspace'], detail: connected ? driverLabel(activeConnection?.driver ?? '') : 'OFFLINE'}, [connected, activeConnection?.name, activeConnection?.driver, activeDatabase])
  useUnifiedStatus(connectionNotice?.message || (activeQueryTab?.status === 'running' ? 'QUERY RUNNING' : connected ? `${transactionLabel} · ${rows.length} ROWS` : '等待数据库连接'), [connectionNotice, activeQueryTab?.status, connected, transactionLabel, rows.length])

  return <div className={`app-shell embedded unified-workspace ${connected ? 'is-connected' : ''}`}>
    <a className="skip-link" href="#sql-editor">跳到 SQL 编辑器</a>
    <div className="embedded-connection-bar visually-hidden" aria-hidden="true">{connectionStatus}</div>

    <main className={`workspace ${activeTab?.kind === 'table' || activeTab?.kind === 'mongo-document' || activeTab?.kind === 'redis-key' ? 'mode-table' : 'mode-query'}${activeTab?.kind === 'query' ? ' unified-split' : ''}`}>
      <div className="status-rail" aria-hidden="true" />
      <nav className="tabbar" aria-label="工作区标签页" role="tablist">
        {tabs.map((tab) => <div className="tab-shell" key={tab.id}><button
          type="button"
          role="tab"
          aria-selected={tab.id === activeTabId}
          tabIndex={tab.id === activeTabId ? 0 : -1}
          className={`tab ${tab.id === activeTabId ? 'active' : ''} ${tab.kind === 'table' ? 'tab-table' : 'tab-query'}`}
          onClick={() => {
            setActiveTabId(tab.id)
            if (tab.kind === 'table' && tab.status !== 'running' && !tab.result) {
              void reloadTableTab(tab.id, {table: tab.table})
            }
          }}
          onKeyDown={(event)=>{
            const index=tabs.findIndex(item=>item.id===tab.id)
            let target=index
            if(event.key==='ArrowRight'||event.key==='ArrowDown')target=(index+1)%tabs.length
            else if(event.key==='ArrowLeft'||event.key==='ArrowUp')target=(index-1+tabs.length)%tabs.length
            else if(event.key==='Home')target=0
            else if(event.key==='End')target=tabs.length-1
            else return
            event.preventDefault();setActiveTabId(tabs[target].id)
            requestAnimationFrame(()=>document.querySelectorAll<HTMLElement>('[role="tab"]')[target]?.focus())
          }}
        >
          <span>{tab.title}</span>
        </button><button
            type="button"
            className="tab-close"
            aria-label={`关闭 ${tab.title}`}
            onClick={(event) => {
              event.stopPropagation()
              closeTab(tab.id)
            }}
          ><Icon name="close" /></button></div>)}
        <button type="button" className="new-tab" aria-label="新建标签" onClick={() => {
          if (isRedisDriver(activeConnection?.driver ?? '')) openRedisConsole()
          else if (isMongoDriver(activeConnection?.driver ?? '')) openQueryTab('[\n  { "$match": {} },\n  { "$limit": 50 }\n]')
          else openQueryTab(initialSQL)
        }}><Icon name="plus" /></button>
      </nav>

      {activeMongoTab && <>
        <section className="table-pane" aria-label="MongoDB 集合">
          <nav className="table-workspace-tabs">
            <button className={activeMongoTab.section === 'documents' ? 'active' : ''} onClick={() => updateTab(activeMongoTab.id, {section: 'documents'} as Partial<MongoDocumentTab>)}>文档</button>
            <button className={activeMongoTab.section === 'query' ? 'active' : ''} onClick={() => updateTab(activeMongoTab.id, {section: 'query'} as Partial<MongoDocumentTab>)}>聚合查询</button>
            <button className={activeMongoTab.section === 'schema' ? 'active' : ''} onClick={() => updateTab(activeMongoTab.id, {section: 'schema'} as Partial<MongoDocumentTab>)}>集合结构</button>
          </nav>
          {activeMongoTab.section === 'documents' && <MongoDocumentView api={api as APIClient} connectionId={connectionId} database={activeMongoTab.collection.schema || activeDatabase} collection={activeMongoTab.collection.name} />}
          {activeMongoTab.section === 'query' && <MongoQueryView api={api as APIClient} connectionId={connectionId} database={activeMongoTab.collection.schema || activeDatabase} collection={activeMongoTab.collection.name} />}
          {activeMongoTab.section === 'schema' && <MongoCollectionSchema api={api as APIClient} connectionId={connectionId} collection={activeMongoTab.collection.name} />}
        </section>
      </>}

      {activeRedisKeyTab && <section className="table-pane" aria-label="Redis 键"><RedisKeyView api={api as APIClient} connectionId={connectionId} keyName={activeRedisKeyTab.key} /></section>}

      {activeRedisConsoleTab && <section className="table-pane" aria-label="Redis 命令台"><RedisConsoleView api={api as APIClient} connectionId={connectionId} /></section>}

      {activeDriverHomeTab && <section className="table-pane workspace-home" aria-label={activeDriverHomeTab.title}>
        <div className="empty-state">
          <h3>{activeDriverHomeTab.title}</h3>
          <p>{activeDriverHomeTab.driver === 'mongodb'
            ? '在左侧对象树中选择集合，或使用 + 新建聚合查询。'
            : '在左侧 SCAN 浏览键，或使用 + 打开命令台。'}</p>
        </div>
      </section>}

      {connected && activeConnection && activeTab?.kind === 'query' && !isSqlDriver(activeConnection.driver) && !activeDriverHomeTab && (
        <section className="table-pane workspace-home" aria-label="工作区">
          <div className="empty-state">
            <h3>{driverLabel(activeConnection.driver)} 工作区</h3>
            <p>{message || '请从左侧对象树选择内容，或使用 + 打开新标签。'}</p>
          </div>
        </section>
      )}

      {activeTab?.kind === 'table' && <>
        <section className="table-pane" aria-label="表数据">
          <nav className="table-workspace-tabs" role="tablist" aria-label="表视图"><button role="tab" aria-selected={structureTabId!==activeTab.id} className={structureTabId===activeTab.id?'':'active'} onClick={()=>{if(!dirtySchemaTabs.has(activeTab.id)||window.confirm('表结构有未保存修改，确认放弃？'))setStructureTabId('')}}>数据预览</button><button role="tab" aria-selected={structureTabId===activeTab.id} className={structureTabId===activeTab.id?'active':''} onClick={()=>setStructureTabId(activeTab.id)}>表结构</button></nav>
          {structureTabId===activeTab.id?<SchemaWorkspace api={api as APIClient} connectionId={connectionId} driver={sqlDriverOrDefault(activeConnection?.driver ?? '')} schema={activeTab.table.schema||activeDatabase} table={activeTab.table.name} onDirtyChange={(dirty)=>setDirtySchemaTabs(current=>{const next=new Set(current);if(dirty)next.add(activeTab.id);else next.delete(activeTab.id);return next})} onSaved={()=>{void refreshMetadata()}}/>:<TableView
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
          />}
        </section>
      </>}

      {activeTab?.kind === 'query' && connected && (!activeConnection || isSqlDriver(activeConnection.driver)) && <>
        <div className="query-toolbar">
          <button type="button" aria-label="执行 SQL" title="执行 SQL（Ctrl/Cmd + Enter）" className="oc-button primary button-with-icon run-query-button" onClick={execute} disabled={!connected || status === 'running'}><Icon name="play" />运行 <kbd>⌘/Ctrl Enter</kbd></button>
          <label className="query-context">数据库<SelectControl className="query-select" ariaLabel="查询数据库" value={activeDatabase} disabled={!connected} options={databases.map(name=>({value:name,label:name}))} onChange={value=>void switchDatabase(value)}/></label>
          <label className="query-context">Schema<SelectControl className="query-select" ariaLabel="查询 Schema" value={querySchema||objects.find(x=>x.kind==='table')?.schema||''} options={[...new Set(objects.filter(x=>x.kind==='table').map(x=>x.schema||''))].map(name=>({value:name,label:name}))} onChange={setQuerySchema}/></label>
          <label className="query-context">表<SelectControl className="query-select table-query-select" ariaLabel="查询表" value={queryTable} options={[{value:'',label:'选择表'},...objects.filter(x=>x.kind==='table').map(x=>({value:qualifiedTableName(x),label:qualifiedTableName(x)}))]} onChange={value=>{setQueryTable(value);const table=objects.find(x=>x.kind==='table'&&qualifiedTableName(x)===value);if(table)updateTab(activeTab.id,{sql:sqlForSelectedTable(activeTab.sql,defaultSelectSQL(table, sqlDriverOrDefault(activeConnection?.driver ?? '')))})}}/></label>
          <span className="toolbar-separator" />
          <button type="button" aria-label="停止查询" className="oc-button button-with-icon" disabled={!queryId || status !== 'running'} onClick={() => void api.cancelQuery(connectionId, queryId)}><Icon name="stop" />停止</button>
          <span className="toolbar-separator" />
          <button type="button" className="oc-button" onClick={async () => transaction.open(await api.beginTransaction(connectionId))} disabled={!connected || Boolean(transactionId)}>开始事务</button>
          <button type="button" className="oc-button" onClick={async () => {await api.finishTransaction(connectionId, transactionId, 'commit'); transaction.close()}} disabled={!transactionId}>提交</button>
          <button type="button" className="oc-button" onClick={async () => {await api.finishTransaction(connectionId, transactionId, 'rollback'); transaction.close()}} disabled={!transactionId}>回滚</button>
          <span className={`transaction-state ${transactionId ? 'open' : ''}`}>{transactionLabel}</span>
        </div>
        <section id="sql-editor" className="editor-pane" aria-label="SQL 编辑区">
          <SqlEditor
            value={sql}
            editorTheme={editorThemeFor(theme)}
            completionContext={sqlCompletionContext}
            onChange={(value) => updateTab(activeTab.id, {sql: value})}
            onExecute={execute}
          />
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

      {!connected && <section className="table-pane workspace-home disconnected-home" aria-label="工作区">
        <div className="empty-state workspace-onboarding">
          <span className="onboarding-icon"><BrandMark size={48} /></span>
          <h3>先连接数据库，再开始工作</h3>
          <p>从资源栏选择个人或团队连接。连接配置统一由连接中心管理。</p>
          <div className="workspace-onboarding-actions">
            {connections.length > 0 && <button className="oc-button primary" onClick={()=>document.querySelector<HTMLInputElement>('[aria-label="搜索数据库连接"]')?.focus()}>选择连接</button>}
            <Link className="oc-button" to="/connections">打开连接中心</Link>
          </div>
        </div>
      </section>}
    </main>

    {risk && <RiskDialog risk={risk} onCancel={() => setRisk(null)} onConfirm={(target) => void run({confirmed:true, confirmationTarget:target})} />}
    {createTableDialog && <CreateTableDialog
      database={createTableDialog.database}
      driver={sqlDriverOrDefault(activeConnection?.driver ?? '')}
      onClose={() => setCreateTableDialog(null)}
      onCreate={(tableName, columns) => void handleCreateTableSubmit(createTableDialog.database, tableName, columns)}
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
