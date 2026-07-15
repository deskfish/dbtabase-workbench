import {FormEvent, useEffect, useMemo, useRef, useState} from 'react'
import {useAuth} from '../auth/AuthProvider'
import {DataGrid} from '../features/ui/DataGrid'
import {Dropzone} from '../features/ui/Dropzone'
import {EmptyState} from '../features/ui/EmptyState'
import {FormDialog} from '../features/ui/FormDialog'
import {SelectControl} from '../features/ui/SelectControl'
import {StatusBadge, type StatusTone} from '../features/ui/StatusBadge'
import {TextField} from '../features/ui/TextField'
import {WorkspaceTabs} from '../features/ui/WorkspaceTabs'
import {useUnifiedContext, useUnifiedRuntime, useUnifiedSidebar, useUnifiedStatus} from '../layout/UnifiedShellContext'
import {logsClient, type LogEntry, type LogScope, type LogSession, type LogsClient, type RemoteLogEntry, type SSHLogConnection} from '../logs/client'
import './LogsPage.css'

function messageFor(error: unknown): string {
  return error instanceof Error ? error.message : '请求失败'
}

function formatTime(value?: number | null): string {
  if (!value) return '—'
  return new Date(value).toLocaleString()
}

function levelTone(level: string): string {
  return level.toLowerCase()
}

function detectLineLevel(line: string): string {
  if (/\bERROR\b/i.test(line)) return 'ERROR'
  if (/\bWARN(ING)?\b/i.test(line)) return 'WARN'
  if (/\bINFO\b/i.test(line)) return 'INFO'
  if (/\bDEBUG\b/i.test(line)) return 'DEBUG'
  if (/\bTRACE\b/i.test(line)) return 'TRACE'
  return 'UNKNOWN'
}

function parentRemotePath(value: string): string {
  const parts = value.split('/').filter(Boolean)
  parts.pop()
  return `/${parts.join('/')}` || '/'
}

function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${bytes} B`
}

function tailStatusLabel(status: 'idle' | 'connecting' | 'live' | 'stopped' | 'error'): string {
  if (status === 'connecting') return '连接中'
  if (status === 'live') return '实时'
  if (status === 'stopped') return '已停止'
  if (status === 'error') return '错误'
  return '空闲'
}

function tailStatusTone(status: 'idle' | 'connecting' | 'live' | 'stopped' | 'error'): StatusTone {
  if (status === 'live') return 'success'
  if (status === 'connecting') return 'info'
  if (status === 'error') return 'danger'
  if (status === 'stopped') return 'warning'
  return 'neutral'
}

const LOG_FILE = /\.(log|txt|out|err)$/i

type TailLine = {id: number; text: string; level: string}
type LogsWorkspace = 'search' | 'upload' | 'ssh' | 'tail'

export function LogsPage({client = logsClient}: {client?: LogsClient}) {
  const {session} = useAuth()
  const adminTeams = useMemo(() => (session?.teams ?? []).filter((team) => team.role === 'admin'), [session])
  const [sessions, setSessions] = useState<LogSession[]>([])
  const [sshConnections, setSshConnections] = useState<SSHLogConnection[]>([])
  const [selectedId, setSelectedId] = useState('')
  const [creating, setCreating] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [searching, setSearching] = useState(false)
  const [loading, setLoading] = useState(true)
  const [sshBusy, setSshBusy] = useState(false)
  const [tailing, setTailing] = useState(false)
  const [importingPath, setImportingPath] = useState('')
  const [batchImporting, setBatchImporting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [newName, setNewName] = useState('')
  const [scope, setScope] = useState('personal')
  const [teamId, setTeamId] = useState(adminTeams[0]?.id ?? '')
  const [serviceName, setServiceName] = useState('')
  const [nodeName, setNodeName] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [query, setQuery] = useState('')
  const [level, setLevel] = useState('')
  const [entries, setEntries] = useState<LogEntry[]>([])
  const [tree, setTree] = useState<LogScope[]>([])
  const [total, setTotal] = useState(0)
  const [sshConnectionId, setSshConnectionId] = useState('')
  const [remotePath, setRemotePath] = useState('/var/log')
  const [remoteEntries, setRemoteEntries] = useState<RemoteLogEntry[]>([])
  const [tailPath, setTailPath] = useState('')
  const [tailStatus, setTailStatus] = useState<'idle' | 'connecting' | 'live' | 'stopped' | 'error'>('idle')
  const [tailLines, setTailLines] = useState<TailLine[]>([])
  const [tailFilter, setTailFilter] = useState('')
  const [tailInitialLines, setTailInitialLines] = useState('200')
  const [tailServiceName, setTailServiceName] = useState('')
  const [tailNodeName, setTailNodeName] = useState('')
  const [workspace, setWorkspace] = useState<LogsWorkspace>('search')
  const [showCreateSession, setShowCreateSession] = useState(false)
  const tailAbortRef = useRef<AbortController | null>(null)
  const tailLineIdRef = useRef(0)

  const selected = sessions.find((item) => item.id === selectedId) ?? sessions[0]
  const selectedSshConnection = sshConnections.find((item) => item.id === sshConnectionId)
  const visibleRemoteEntries = useMemo(() => remoteEntries.filter((entry) => entry.type === 'directory' || (entry.type === 'file' && LOG_FILE.test(entry.name))), [remoteEntries])
  const visibleTailLines = useMemo(() => {
    const keyword = tailFilter.trim().toLowerCase()
    if (!keyword) return tailLines
    return tailLines.filter((line) => line.text.toLowerCase().includes(keyword))
  }, [tailFilter, tailLines])

  const sidebarContent = useMemo(() => (
    <>
      <header className="panel-heading">
        <div><span>日志会话</span><small>{sessions.length} 个会话</small></div>
      </header>
      <div className="logs-session-list">
        {loading ? <div className="workbench-sidebar-state" role="status">正在加载…</div> : sessions.length === 0 ? (
          <p className="workbench-sidebar-empty">暂无日志会话。</p>
        ) : sessions.map((item) => (
          <button key={item.id} type="button" className="logs-session-item" data-active={selected?.id === item.id} onClick={() => { setSelectedId(item.id); setWorkspace('search'); setEntries([]); setTree([]); setTotal(0) }}>
            <strong>{item.name}</strong>
            <span>{item.fileCount} 文件 · {item.serviceCount} 服务</span>
            <small>{item.scope === 'team' ? '团队' : '个人'}</small>
          </button>
        ))}
      </div>
    </>
  ), [loading, selected?.id, sessions])

  useUnifiedSidebar(sidebarContent, {label: '日志会话', deps: [loading, selected?.id, sessions]})
  const logContext = selected ? <div className="logs-terminal-context">
    <span className="logs-eyebrow">ACTIVE SESSION</span><h3>{selected.name}</h3>
    <dl><div><dt>范围</dt><dd>{selected.scope === 'team' ? '团队' : '个人'}</dd></div><div><dt>文件</dt><dd>{selected.fileCount}</dd></div><div><dt>服务</dt><dd>{selected.serviceCount}</dd></div><div><dt>工作区</dt><dd>{workspace}</dd></div></dl>
    <StatusBadge tone={tailing ? 'success' : 'info'}>{tailing ? '实时流运行中' : '会话就绪'}</StatusBadge>
  </div> : null
  useUnifiedContext(logContext, {label: '日志上下文', deps: [selected?.id, workspace, tailing]})
  useUnifiedRuntime({path: ['logs', selected?.name ?? 'sessions', workspace], detail: tailing ? `${visibleTailLines.length} lines` : searching ? '搜索中' : undefined}, [selected?.id, workspace, tailing, visibleTailLines.length, searching])
  useUnifiedStatus(error || success || (tailing ? `LIVE · ${visibleTailLines.length} LINES` : searching ? '正在检索日志…' : `READY · ${total} MATCHES`), [error, success, tailing, visibleTailLines.length, searching, total])

  async function load() {
    setLoading(true)
    setError('')
    try {
      const [items, sshItems] = await Promise.all([client.listSessions(), client.listSshConnections()])
      setSessions(items)
      setSshConnections(sshItems)
      setSelectedId((current) => current || items[0]?.id || '')
      setSshConnectionId((current) => current || sshItems[0]?.id || '')
    } catch (err) {
      setError(messageFor(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (scope === 'team' && !teamId && adminTeams[0]) setTeamId(adminTeams[0].id)
  }, [adminTeams, scope, teamId])

  useEffect(() => () => {
    tailAbortRef.current?.abort()
  }, [])

  async function createSession(event: FormEvent) {
    event.preventDefault()
    setCreating(true)
    setError('')
    setSuccess('')
    try {
      const created = await client.createSession({
        name: newName.trim() || '日志分析',
        scope,
        teamId: scope === 'team' ? teamId : undefined,
      })
      setSessions((current) => [created, ...current.filter((item) => item.id !== created.id)])
      setSelectedId(created.id)
      setNewName('')
      setShowCreateSession(false)
      setWorkspace('search')
      setSuccess('日志会话已创建')
    } catch (err) {
      setError(messageFor(err))
    } finally {
      setCreating(false)
    }
  }

  async function upload(event: FormEvent) {
    event.preventDefault()
    if (!selected || !file) return
    setUploading(true)
    setError('')
    setSuccess('')
    try {
      await client.uploadFile({sessionId: selected.id, file, serviceName: serviceName.trim(), nodeName: nodeName.trim()})
      setSuccess('日志已上传并完成索引')
      setFile(null)
      await refreshSearch(selected.id)
      await load()
    } catch (err) {
      setError(messageFor(err))
    } finally {
      setUploading(false)
    }
  }

  async function refreshSearch(sessionId = selected?.id) {
    if (!sessionId) return
    setSearching(true)
    setError('')
    try {
      const result = await client.search(sessionId, {query: query.trim(), level, limit: 200})
      setEntries(result.entries)
      setTree(result.tree ?? [])
      setTotal(result.total)
    } catch (err) {
      setError(messageFor(err))
    } finally {
      setSearching(false)
    }
  }

  async function search(event: FormEvent) {
    event.preventDefault()
    await refreshSearch()
  }

  async function testSshConnection() {
    if (!sshConnectionId) {
      setError('请先选择 SSH 连接')
      return
    }
    setSshBusy(true)
    setError('')
    setSuccess('')
    try {
      await client.testSshConnection(sshConnectionId)
      setSuccess('SSH 连接测试通过')
    } catch (err) {
      setError(messageFor(err))
    } finally {
      setSshBusy(false)
    }
  }

  async function browseSsh(pathOverride?: string) {
    if (!sshConnectionId) {
      setError('请先选择 SSH 连接')
      return
    }
    setSshBusy(true)
    setError('')
    setSuccess('')
    try {
      const result = await client.browseSsh({connectionId: sshConnectionId, path: (pathOverride ?? remotePath.trim()) || '/'})
      setRemotePath(result.path || remotePath)
      setRemoteEntries(result.entries ?? [])
      setSuccess('远程目录已读取')
    } catch (err) {
      setError(messageFor(err))
    } finally {
      setSshBusy(false)
    }
  }

  async function scanSsh() {
    if (!sshConnectionId) {
      setError('请先选择 SSH 连接')
      return
    }
    setSshBusy(true)
    setError('')
    setSuccess('')
    try {
      const result = await client.scanSsh({connectionId: sshConnectionId, path: remotePath.trim() || '/', maxDepth: 8, maxFiles: 1000})
      setRemoteEntries(result.entries ?? [])
      setSuccess(`扫描到 ${result.entries?.length ?? 0} 个日志文件${result.truncated ? '（结果已截断）' : ''}`)
    } catch (err) {
      setError(messageFor(err))
    } finally {
      setSshBusy(false)
    }
  }

  function stopTail() {
    tailAbortRef.current?.abort()
    tailAbortRef.current = null
    setTailing(false)
    setTailStatus((current) => current === 'live' || current === 'connecting' ? 'stopped' : current)
  }

  async function startTail(entry: RemoteLogEntry) {
    if (!selected) {
      setError('请先创建或选择日志会话')
      return
    }
    if (!sshConnectionId) {
      setError('请先选择 SSH 连接')
      return
    }
    stopTail()
    const controller = new AbortController()
    tailAbortRef.current = controller
    setTailing(true)
    setTailStatus('connecting')
    setTailPath(entry.path)
    setWorkspace('tail')
    setTailLines([])
    setError('')
    setSuccess('')
    const initialLines = Math.min(5000, Math.max(0, Number(tailInitialLines) || 0))
    try {
      await client.tailSsh({
        sessionId: selected.id,
        connectionId: sshConnectionId,
        path: entry.path,
        lines: initialLines,
        serviceName: tailServiceName.trim(),
        nodeName: tailNodeName.trim(),
      }, (event) => {
        if (event.type === 'ready') {
          setTailStatus('live')
          setSuccess(`正在 tail ${event.path}`)
          return
        }
        if (event.type === 'line') {
          tailLineIdRef.current += 1
          setTailLines((current) => {
            const next = [...current, {id: tailLineIdRef.current, text: event.line, level: event.entry?.level ?? detectLineLevel(event.line)}]
            return next.length > 5000 ? next.slice(next.length - 5000) : next
          })
          return
        }
        if (event.type === 'error') {
          setTailStatus('error')
          setError(event.message)
          return
        }
        if (event.type === 'done' || event.type === 'stopped') {
          setTailStatus(event.type === 'stopped' ? 'stopped' : 'idle')
        }
      }, controller.signal)
      if (!controller.signal.aborted) setTailStatus((current) => current === 'live' || current === 'connecting' ? 'stopped' : current)
    } catch (err) {
      if (!controller.signal.aborted) {
        setTailStatus('error')
        setError(messageFor(err))
      }
    } finally {
      if (tailAbortRef.current === controller) tailAbortRef.current = null
      setTailing(false)
      await load()
    }
  }

  async function importRemoteFile(entry: RemoteLogEntry) {
    if (!selected) {
      setError('请先创建或选择日志会话')
      return
    }
    if (!sshConnectionId) {
      setError('请先选择 SSH 连接')
      return
    }
    setImportingPath(entry.path)
    setError('')
    setSuccess('')
    try {
      await client.importSshFile({
        sessionId: selected.id,
        connectionId: sshConnectionId,
        path: entry.path,
        serviceName: tailServiceName.trim(),
        nodeName: tailNodeName.trim(),
      })
      setSuccess('远程日志已导入并完成索引')
      await refreshSearch(selected.id)
      await load()
    } catch (err) {
      setError(messageFor(err))
    } finally {
      setImportingPath('')
    }
  }

  async function importVisibleFiles() {
    if (!selected || !sshConnectionId) {
      setError('请先选择日志会话和 SSH 连接')
      return
    }
    const files = visibleRemoteEntries.filter((entry) => entry.type === 'file')
    if (files.length === 0) {
      setError('当前没有可导入的日志文件')
      return
    }
    setBatchImporting(true)
    setError('')
    setSuccess('')
    try {
      for (const entry of files) {
        setImportingPath(entry.path)
        await client.importSshFile({
          sessionId: selected.id,
          connectionId: sshConnectionId,
          path: entry.path,
          serviceName: tailServiceName.trim(),
          nodeName: tailNodeName.trim(),
        })
      }
      setSuccess(`已导入 ${files.length} 个远程日志文件`)
      await refreshSearch(selected?.id)
      await load()
    } catch (err) {
      setError(messageFor(err))
    } finally {
      setImportingPath('')
      setBatchImporting(false)
    }
  }

  return (
    <section className="product-workbench-page logs-page">
      <div className="unified-page-frame">
        <header className="unified-page-toolbar">
          <h2>日志</h2>
          <span className="unified-page-toolbar-spacer" />
          {selected && <StatusBadge tone={selected.status === 'ready' ? 'success' : 'info'}>{selected.status === 'ready' ? '已完成索引' : selected.status}</StatusBadge>}
          {selected && <span className="workbench-pane-meta">{selected.name} · {selected.fileCount} 文件</span>}
          <button className="oc-button primary" type="button" onClick={() => setShowCreateSession(true)}>新建会话</button>
        </header>
        <div className="unified-page-body">
          {(success || error) && <div className="logs-feedback">{success && <p className="form-success" role="status">{success}</p>}{error && <p className="form-error" role="alert">{error}</p>}</div>}
          {!selected ? (
            <EmptyState title="先选择或新建日志会话" description="从左侧选择已有会话，或点击右上角「新建会话」开始工作。" />
          ) : (
            <div className="logs-workspace">
              <WorkspaceTabs
                ariaLabel="日志工具"
                value={workspace}
                onChange={(value) => setWorkspace(value as LogsWorkspace)}
                tabs={[
                  {value: 'search', label: '日志检索'},
                  {value: 'upload', label: '本地导入'},
                  {value: 'ssh', label: 'SSH 文件'},
                  {value: 'tail', label: '实时 Tail'},
                ]}
              />

              {workspace === 'search' && (
                <section className="logs-panel logs-search-panel" aria-label="日志检索">
                  <form className="logs-search-toolbar" onSubmit={search}>
                    <TextField label="搜索日志" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="关键字，例如 failed、timeout" />
                    <div className="field-block"><span>级别</span><SelectControl ariaLabel="日志级别" value={level} options={[{value: '', label: '全部'}, {value: 'ERROR', label: 'ERROR'}, {value: 'WARN', label: 'WARN'}, {value: 'INFO', label: 'INFO'}, {value: 'DEBUG', label: 'DEBUG'}]} onChange={setLevel} /></div>
                    <button className="oc-button primary" type="submit" disabled={searching}>{searching ? '搜索中…' : '搜索'}</button>
                    <span className="logs-result-count">{total} 条匹配</span>
                  </form>
                  {tree.length > 0 && <div className="logs-scope-summary" aria-label="服务节点">{tree.map((service) => service.nodes.map((node) => <StatusBadge key={`${service.serviceName}/${node.nodeName}`} tone="info">{service.serviceName} / {node.nodeName}</StatusBadge>))}</div>}
                  <DataGrid label="日志检索结果" loading={searching} empty={entries.length === 0 ? <EmptyState title="暂无查询结果" description="导入日志后输入关键字或直接搜索全部内容。" /> : undefined}>
                    <thead><tr><th>时间</th><th>级别</th><th>服务/节点</th><th>内容</th><th>行</th></tr></thead>
                    <tbody>{entries.map((entry) => <tr key={entry.id}><td>{formatTime(entry.timestampMs)}</td><td><span className={`log-level ${levelTone(entry.level)}`}>{entry.level}</span></td><td>{entry.serviceName} / {entry.nodeName}</td><td className="logs-message"><code>{entry.message}</code></td><td>{entry.lineNumber}</td></tr>)}</tbody>
                  </DataGrid>
                </section>
              )}

              {workspace === 'upload' && (
                <section className="logs-panel logs-upload-panel" aria-label="本地导入">
                  <header className="logs-panel-head"><div><strong>上传本地日志</strong><span>支持 .log 与 .txt 文件</span></div></header>
                  <form className="logs-upload-form" onSubmit={upload}>
                    <Dropzone label="日志文件" accept=".log,.txt,text/plain" file={file} onChange={setFile} />
                    <div className="logs-upload-fields">
                      <TextField label="服务名" value={serviceName} onChange={(event) => setServiceName(event.target.value)} placeholder="留空则按文件名推断" />
                      <TextField label="节点名" value={nodeName} onChange={(event) => setNodeName(event.target.value)} placeholder="留空则按文件名推断" />
                    </div>
                    <div className="logs-form-actions"><button className="oc-button primary" type="submit" disabled={!file || uploading}>{uploading ? '索引中…' : '上传并索引'}</button></div>
                  </form>
                </section>
              )}

              {workspace === 'ssh' && (
                <section className="logs-panel logs-ssh-panel" aria-label="SSH 文件">
                  {sshConnections.length === 0 ? <EmptyState title="暂无 SSH 连接" description="请先在连接中心创建 SSH 类型的个人或团队连接。" /> : <>
                    <div className="logs-ssh-controls">
                      <div className="logs-ssh-fields">
                        <div className="field-block"><span>SSH 连接</span><SelectControl ariaLabel="SSH 连接" value={sshConnectionId} options={sshConnections.map((item) => ({value: item.id, label: `${item.name} · ${item.endpoint.host}:${item.endpoint.port}`}))} onChange={(value) => { setSshConnectionId(value); setRemoteEntries([]) }} /></div>
                        <TextField label="远程目录" value={remotePath} onChange={(event) => setRemotePath(event.target.value)} placeholder="/var/log" />
                        <TextField label="初始行数" inputMode="numeric" value={tailInitialLines} onChange={(event) => setTailInitialLines(event.target.value)} />
                      </div>
                      <div className="logs-ssh-fields logs-ssh-meta">
                        <TextField label="服务名" value={tailServiceName} onChange={(event) => setTailServiceName(event.target.value)} placeholder="留空按文件名推断" />
                        <TextField label="节点名" value={tailNodeName} onChange={(event) => setTailNodeName(event.target.value)} placeholder={selectedSshConnection?.endpoint.host ?? '远程主机'} />
                        <div className="logs-form-actions"><button className="oc-button" type="button" disabled={!sshConnectionId || sshBusy} onClick={() => void testSshConnection()}>测试连接</button><button className="oc-button primary" type="button" disabled={!sshConnectionId || sshBusy} onClick={() => void browseSsh()}>{sshBusy ? '读取中…' : '浏览目录'}</button><button className="oc-button" type="button" disabled={!sshConnectionId || sshBusy} onClick={() => void scanSsh()}>扫描日志</button></div>
                      </div>
                    </div>
                    <div className="logs-remote-toolbar"><button className="oc-button" type="button" disabled={sshBusy || remotePath === '/'} onClick={() => void browseSsh(parentRemotePath(remotePath))}>上级</button><code>{remotePath}</code><button className="oc-button" type="button" disabled={batchImporting || visibleRemoteEntries.every((entry) => entry.type !== 'file')} onClick={() => void importVisibleFiles()}>{batchImporting ? '批量导入中…' : '导入全部'}</button></div>
                    <DataGrid label="远程日志文件" loading={sshBusy} empty={visibleRemoteEntries.length === 0 ? <EmptyState title="暂无远程日志" description="浏览目录或递归扫描 .log、.txt、.out、.err 文件。" /> : undefined}>
                      <thead><tr><th>名称</th><th>信息</th><th>操作</th></tr></thead>
                      <tbody>{visibleRemoteEntries.map((entry) => <tr key={entry.path}><th scope="row">{entry.name}</th><td>{entry.type === 'directory' ? '目录' : `${formatSize(entry.size)} · ${formatTime(entry.modifiedAt)}`}</td><td><div className="row-actions">{entry.type === 'directory' ? <button className="oc-button" type="button" onClick={() => void browseSsh(entry.path)}>进入</button> : <><button className="oc-button" type="button" aria-label={`导入 ${entry.name}`} disabled={importingPath === entry.path} onClick={() => void importRemoteFile(entry)}>{importingPath === entry.path ? '导入中…' : '导入'}</button><button className="oc-button primary" type="button" aria-label={`Tail ${entry.name}`} disabled={tailing && tailPath === entry.path} onClick={() => void startTail(entry)}>{tailing && tailPath === entry.path ? 'Tail 中…' : 'Tail'}</button></>}</div></td></tr>)}</tbody>
                    </DataGrid>
                  </>}
                </section>
              )}

              {workspace === 'tail' && (
                <section className="logs-tail-panel" aria-label="实时 Tail">
                  <div className="logs-tail-toolbar"><TextField label="过滤" value={tailFilter} onChange={(event) => setTailFilter(event.target.value)} placeholder="关键字" /><StatusBadge tone={tailStatusTone(tailStatus)}>{tailStatusLabel(tailStatus)}</StatusBadge><button className="oc-button" type="button" disabled={tailStatus !== 'live' && tailStatus !== 'connecting'} onClick={stopTail}>停止</button><button className="oc-button" type="button" disabled={tailLines.length === 0} onClick={() => setTailLines([])}>清空</button></div>
                  <div className="logs-tail-output" role="log" aria-label="Tail 输出"><div className="visually-hidden" aria-live="polite">{tailStatusLabel(tailStatus)}</div>{visibleTailLines.length === 0 ? <p>{tailStatus === 'connecting' ? '正在连接 tail 流…' : '在 SSH 文件标签中选择日志文件开始实时输出。'}</p> : visibleTailLines.map((line) => <div key={line.id} className="logs-tail-line" data-level={levelTone(line.level)}><code>{line.text}</code></div>)}</div>
                </section>
              )}
            </div>
          )}
        </div>
      </div>

      {showCreateSession && (
        <FormDialog title="新建日志会话" description="会话用于隔离日志文件、检索结果和实时 Tail。" submitLabel="创建日志会话" submitting={creating} onCancel={() => setShowCreateSession(false)} onSubmit={createSession}>
          <TextField label="会话名称" value={newName} onChange={(event) => setNewName(event.target.value)} placeholder="例如 deploy-2026-07-08" />
          <div className="field-block"><span>范围</span><SelectControl ariaLabel="日志范围" value={scope} options={[{value: 'personal', label: '个人'}, {value: 'team', label: '团队'}]} onChange={setScope} /></div>
          {scope === 'team' && <div className="field-block"><span>团队</span><SelectControl ariaLabel="日志团队" value={teamId} options={adminTeams.map((team) => ({value: team.id, label: team.name}))} onChange={setTeamId} /></div>}
        </FormDialog>
      )}
    </section>
  )
}
