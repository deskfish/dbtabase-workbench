import { FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '../auth/AuthProvider'
import { SelectControl } from '../features/ui/SelectControl'
import { logsClient, type LogEntry, type LogScope, type LogSession, type LogsClient, type RemoteLogEntry, type SSHLogConnection } from '../logs/client'
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

const LOG_FILE = /\.(log|txt|out|err)$/i

type TailLine = {id: number; text: string; level: string}

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
  const [tailInitialLines, setTailInitialLines] = useState(200)
  const [tailServiceName, setTailServiceName] = useState('')
  const [tailNodeName, setTailNodeName] = useState('')
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

  async function browseSsh(event?: FormEvent, pathOverride?: string) {
    event?.preventDefault()
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
    setTailLines([])
    setError('')
    setSuccess('')
    try {
      await client.tailSsh({
        sessionId: selected.id,
        connectionId: sshConnectionId,
        path: entry.path,
        lines: tailInitialLines,
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
    <section className="ops-page logs-page">
      <div className="page-heading-row">
        <div>
          <p className="login-kicker">LOGS</p>
          <h1>日志</h1>
          <p>创建日志分析会话，上传本地日志，或通过已保存的 SSH 连接浏览远程文件并实时 tail。</p>
        </div>
      </div>
      {success && <p className="form-success" role="status">{success}</p>}
      {error && <p className="form-error" role="alert">{error}</p>}

      <div className="logs-layout">
        <aside className="ops-panel logs-sidebar">
          <h2>日志会话</h2>
          <form className="logs-create-form" onSubmit={createSession}>
            <label>会话名称<input value={newName} onChange={(event) => setNewName(event.target.value)} placeholder="例如 deploy-2026-07-08" /></label>
            <div className="field-block">
              <span>范围</span>
              <SelectControl ariaLabel="日志范围" value={scope} options={[{value: 'personal', label: '个人'}, {value: 'team', label: '团队'}]} onChange={setScope} />
            </div>
            {scope === 'team' && (
              <div className="field-block">
                <span>团队</span>
                <SelectControl ariaLabel="日志团队" value={teamId} options={adminTeams.map((team) => ({value: team.id, label: team.name}))} onChange={setTeamId} />
              </div>
            )}
            <button className="oc-button primary" type="submit" disabled={creating}>{creating ? '创建中…' : '创建日志会话'}</button>
          </form>
          <div className="logs-session-list">
            {loading ? <p>正在加载日志会话…</p> : sessions.length === 0 ? <p className="empty-state">暂无日志会话，先创建一个并上传日志。</p> : sessions.map((item) => (
              <button key={item.id} type="button" className="logs-session-item" data-active={selected?.id === item.id} onClick={() => { setSelectedId(item.id); setEntries([]); setTree([]); setTotal(0) }}>
                <strong>{item.name}</strong>
                <span>{item.fileCount} 文件 · {item.serviceCount} 服务 · {item.scope === 'team' ? '团队' : '个人'}</span>
              </button>
            ))}
          </div>
        </aside>

        <main className="logs-workspace">
          {!selected ? (
            <section className="ops-panel">
              <h2>还没有会话</h2>
              <p>创建日志会话后，这里会显示上传、搜索和分析视图。</p>
            </section>
          ) : (
            <>
              <section className="ops-panel logs-session-head">
                <div>
                  <h2>{selected.name}</h2>
                  <p>{selected.status === 'ready' ? '已完成索引' : selected.status} · {selected.fileCount} 个文件</p>
                </div>
                <span className="badge">{selected.scope === 'team' ? '团队日志' : '个人日志'}</span>
              </section>

              <section className="ops-panel logs-upload-panel">
                <h2>上传日志</h2>
                <form className="logs-upload-form" onSubmit={upload}>
                  <label>日志文件<input aria-label="日志文件" type="file" accept=".log,.txt,text/plain" onChange={(event) => setFile(event.target.files?.[0] ?? null)} /></label>
                  <label>服务名<input value={serviceName} onChange={(event) => setServiceName(event.target.value)} placeholder="留空则按文件名推断" /></label>
                  <label>节点名<input value={nodeName} onChange={(event) => setNodeName(event.target.value)} placeholder="留空则按文件名推断" /></label>
                  <button className="oc-button primary" type="submit" disabled={!file || uploading}>{uploading ? '索引中…' : '上传并索引'}</button>
                </form>
              </section>

              <section className="ops-panel logs-ssh-panel">
                <div className="panel-title-row">
                  <div>
                    <h2>SSH 实时 tail</h2>
                    <p>复用统一连接库中的 SSH 连接，按当前会话权限写入日志索引。</p>
                  </div>
                  <span className={`logs-tail-status ${tailStatus}`}>{tailStatus === 'live' ? 'LIVE' : tailStatus.toUpperCase()}</span>
                </div>

                {sshConnections.length === 0 ? (
                  <div className="empty-state">暂无 SSH 连接。请先到「连接」页创建 kind=ssh 的个人或团队连接。</div>
                ) : (
                  <>
                    <form className="logs-ssh-form" onSubmit={browseSsh}>
                      <div className="field-block">
                        <span>SSH 连接</span>
                        <SelectControl
                          ariaLabel="SSH 连接"
                          value={sshConnectionId}
                          options={sshConnections.map((item) => ({value: item.id, label: `${item.name} · ${item.endpoint.host}:${item.endpoint.port}`}))}
                          onChange={(value) => {
                            setSshConnectionId(value)
                            setRemoteEntries([])
                          }}
                        />
                      </div>
                      <label>远程目录<input aria-label="远程目录" value={remotePath} onChange={(event) => setRemotePath(event.target.value)} placeholder="/var/log" /></label>
                      <label>初始行数<input aria-label="Tail 初始行数" type="number" min={0} max={5000} value={tailInitialLines} onChange={(event) => setTailInitialLines(Math.min(5000, Math.max(0, Number(event.target.value) || 0)))} /></label>
                      <button className="oc-button" type="button" disabled={!sshConnectionId || sshBusy} onClick={() => void testSshConnection()}>{sshBusy ? '处理中…' : '测试连接'}</button>
                      <button className="oc-button primary" type="submit" disabled={!sshConnectionId || sshBusy}>{sshBusy ? '读取中…' : '浏览目录'}</button>
                      <button className="oc-button" type="button" disabled={!sshConnectionId || sshBusy} onClick={() => void scanSsh()}>扫描日志</button>
                    </form>

                    <div className="logs-tail-fields">
                      <label>服务名<input value={tailServiceName} onChange={(event) => setTailServiceName(event.target.value)} placeholder="留空按文件名推断" /></label>
                      <label>节点名<input value={tailNodeName} onChange={(event) => setTailNodeName(event.target.value)} placeholder={selectedSshConnection?.endpoint.host ?? '远程主机'} /></label>
                    </div>

                    <div className="logs-ssh-workspace">
                      <div className="logs-remote-browser">
                        <div className="logs-remote-toolbar">
                          <button className="oc-button" type="button" disabled={sshBusy || remotePath === '/'} onClick={() => void browseSsh(undefined, parentRemotePath(remotePath))}>上级</button>
                          <span>{remotePath}</span>
                          <button className="oc-button" type="button" disabled={batchImporting || visibleRemoteEntries.every((entry) => entry.type !== 'file')} onClick={() => void importVisibleFiles()}>{batchImporting ? '批量导入中…' : '导入全部'}</button>
                        </div>
                        {visibleRemoteEntries.length === 0 ? (
                          <div className="empty-state">还没有读取目录，或当前目录没有 .log / .txt / .out / .err 文件。</div>
                        ) : visibleRemoteEntries.map((entry) => (
                          <article key={entry.path} className="logs-remote-entry" data-type={entry.type}>
                            <div>
                              <strong>{entry.name}</strong>
                              <span>{entry.type === 'directory' ? '目录' : `${formatSize(entry.size)} · ${formatTime(entry.modifiedAt)}`}</span>
                            </div>
                            {entry.type === 'directory' ? (
                              <button className="oc-button" type="button" onClick={() => void browseSsh(undefined, entry.path)}>进入</button>
                            ) : (
                              <div className="logs-remote-actions">
                                <button className="oc-button" type="button" aria-label={`导入 ${entry.name}`} disabled={importingPath === entry.path} onClick={() => void importRemoteFile(entry)}>
                                  {importingPath === entry.path ? '导入中…' : '导入'}
                                </button>
                                <button className="oc-button primary" type="button" aria-label={`Tail ${entry.name}`} disabled={tailing && tailPath === entry.path} onClick={() => void startTail(entry)}>
                                  {tailing && tailPath === entry.path ? 'Tail 中…' : 'Tail'}
                                </button>
                              </div>
                            )}
                          </article>
                        ))}
                      </div>

                      <div className="logs-tail-console">
                        <div className="logs-tail-toolbar">
                          <label>过滤<input aria-label="过滤 tail 输出" value={tailFilter} onChange={(event) => setTailFilter(event.target.value)} placeholder="关键字" /></label>
                          <button className="oc-button" type="button" disabled={tailStatus !== 'live' && tailStatus !== 'connecting'} onClick={stopTail}>停止</button>
                          <button className="oc-button" type="button" disabled={tailLines.length === 0} onClick={() => setTailLines([])}>清空</button>
                        </div>
                        <div className="logs-tail-output" aria-live="polite">
                          {visibleTailLines.length === 0 ? (
                            <p>{tailStatus === 'connecting' ? '正在连接 tail 流…' : '选择远程日志文件后开始实时输出。'}</p>
                          ) : visibleTailLines.map((line) => (
                            <div key={line.id} className="logs-tail-line" data-level={levelTone(line.level)}>
                              <code>{line.text}</code>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </section>

              <section className="ops-panel logs-search-panel">
                <div className="panel-title-row">
                  <h2>查询视图</h2>
                  <span>{total} 条匹配</span>
                </div>
                <form className="logs-search-form" onSubmit={search}>
                  <label>搜索日志<input aria-label="搜索日志" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="关键字，例如 failed、timeout、订单号" /></label>
                  <div className="field-block">
                    <span>级别</span>
                    <SelectControl ariaLabel="日志级别" value={level} options={[{value: '', label: '全部'}, {value: 'ERROR', label: 'ERROR'}, {value: 'WARN', label: 'WARN'}, {value: 'INFO', label: 'INFO'}, {value: 'DEBUG', label: 'DEBUG'}]} onChange={setLevel} />
                  </div>
                  <button className="oc-button" type="submit" disabled={searching}>{searching ? '搜索中…' : '搜索'}</button>
                </form>

                {tree.length > 0 && (
                  <div className="logs-scope-summary" aria-label="服务节点">
                    {tree.map((service) => service.nodes.map((node) => <span key={`${service.serviceName}/${node.nodeName}`} className="badge">{service.serviceName} / {node.nodeName}</span>))}
                  </div>
                )}

                {entries.length === 0 ? <div className="empty-state">暂无查询结果。上传日志后可直接搜索。</div> : (
                  <div className="logs-table-wrap">
                    <table className="logs-table">
                      <thead><tr><th>时间</th><th>级别</th><th>服务/节点</th><th>内容</th><th>行</th></tr></thead>
                      <tbody>
                        {entries.map((entry) => (
                          <tr key={entry.id}>
                            <td>{formatTime(entry.timestampMs)}</td>
                            <td><span className={`log-level ${levelTone(entry.level)}`}>{entry.level}</span></td>
                            <td>{entry.serviceName} / {entry.nodeName}</td>
                            <td><code>{entry.message}</code></td>
                            <td>{entry.lineNumber}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            </>
          )}
        </main>
      </div>
    </section>
  )
}
