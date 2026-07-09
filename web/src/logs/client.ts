import { authFetch, json } from '../auth/client'

export type LogSession = {
  id: string
  name: string
  status: string
  scope: string
  ownerUserId?: string
  teamId?: string
  createdAt: string
  updatedAt: string
  fileCount: number
  serviceCount: number
  errorMessage?: string
}

export type LogSourceFile = {
  id: string
  sessionId: string
  serviceName: string
  nodeName: string
  originalName: string
  totalLines: number
  parseStatus: string
  sourceType: string
}

export type LogEntry = {
  id: number
  sessionId: string
  sourceFileId: string
  timestampMs?: number | null
  level: string
  serviceName: string
  nodeName: string
  message: string
  raw: string
  lineNumber: number
}

export type LogScopeNode = {nodeName: string; lineCount: number}
export type LogScope = {serviceName: string; lineCount: number; nodes: LogScopeNode[]}
export type LogBucket = {bucketStartMs: number; count: number; errorCount: number}
export type SSHLogConnection = {
  id: string
  name: string
  scope: string
  teamId?: string
  endpoint: {host: string; port: number}
}
export type RemoteLogEntry = {
  name: string
  path: string
  type: 'file' | 'directory' | 'other'
  size: number
  modifiedAt: number
}
export type TailEvent =
  | {type: 'ready'; path: string; sourceFile: LogSourceFile}
  | {type: 'line'; line: string; entry: LogEntry}
  | {type: 'error'; message: string}
  | {type: 'done'}
  | {type: 'stopped'}

export type LogSearchResult = {
  entries: LogEntry[]
  total: number
  countExact: boolean
  tree: LogScope[]
}

export type CreateLogSessionInput = {
  name: string
  scope: string
  teamId?: string
}

export type UploadLogInput = {
  sessionId: string
  file: File
  serviceName?: string
  nodeName?: string
}

export type LogSearchInput = {
  query?: string
  level?: string
  service?: string
  nodeKey?: string
  limit?: number
}

export type BrowseSSHInput = {
  connectionId: string
  path: string
}

export type ScanSSHInput = BrowseSSHInput & {
  maxDepth?: number
  maxFiles?: number
}

export type ScanSSHResult = {
  entries: RemoteLogEntry[]
  truncated: boolean
  maxDepth: number
  maxFiles: number
}

export type TailSSHInput = {
  sessionId: string
  connectionId: string
  path: string
  lines: number
  serviceName?: string
  nodeName?: string
}

export type ImportSSHInput = {
  sessionId: string
  connectionId: string
  path: string
  serviceName?: string
  nodeName?: string
}

export type LogsClient = {
  listSessions(): Promise<LogSession[]>
  createSession(input: CreateLogSessionInput): Promise<LogSession>
  uploadFile(input: UploadLogInput): Promise<LogSourceFile>
  listSshConnections(): Promise<SSHLogConnection[]>
  testSshConnection(connectionId: string): Promise<void>
  browseSsh(input: BrowseSSHInput): Promise<{path: string; entries: RemoteLogEntry[]}>
  scanSsh(input: ScanSSHInput): Promise<ScanSSHResult>
  importSshFile(input: ImportSSHInput): Promise<LogSourceFile>
  tailSsh(input: TailSSHInput, onEvent: (event: TailEvent) => void, signal: AbortSignal): Promise<void>
  search(sessionId: string, input: LogSearchInput): Promise<LogSearchResult>
  timeline(sessionId: string): Promise<{bucketSizeMs: number; buckets: LogBucket[]}>
  files(sessionId: string): Promise<{files: LogSourceFile[]}>
  removeSession(sessionId: string): Promise<void>
}

function appendIfPresent(params: URLSearchParams, key: string, value?: string | number) {
  if (value === undefined || value === '') return
  params.append(key, String(value))
}

export const logsClient: LogsClient = {
  async listSessions() {
    const result = await json<{sessions: LogSession[]}>('/api/logs/sessions')
    return result.sessions ?? []
  },
  async createSession(input) {
    const result = await json<{session: LogSession}>('/api/logs/sessions', {
      method: 'POST',
      body: JSON.stringify(input),
    })
    return result.session
  },
  async uploadFile(input) {
    const form = new FormData()
    form.append('file', input.file)
    if (input.serviceName) form.append('serviceName', input.serviceName)
    if (input.nodeName) form.append('nodeName', input.nodeName)
    const response = await authFetch(`/api/logs/sessions/${encodeURIComponent(input.sessionId)}/upload`, {
      method: 'POST',
      body: form,
    })
    const result = await response.json() as {file: LogSourceFile}
    return result.file
  },
  async listSshConnections() {
    const result = await json<{connections: SSHLogConnection[]}>('/api/logs/ssh-connections')
    return result.connections ?? []
  },
  async testSshConnection(connectionId) {
    await json<{ok: boolean}>('/api/logs/ssh/test', {
      method: 'POST',
      body: JSON.stringify({connectionId}),
    })
  },
  async browseSsh(input) {
    return await json<{path: string; entries: RemoteLogEntry[]}>('/api/logs/ssh/browse', {
      method: 'POST',
      body: JSON.stringify(input),
    })
  },
  async scanSsh(input) {
    return await json<ScanSSHResult>('/api/logs/ssh/scan', {
      method: 'POST',
      body: JSON.stringify(input),
    })
  },
  async importSshFile(input) {
    const result = await json<{file: LogSourceFile}>(`/api/logs/sessions/${encodeURIComponent(input.sessionId)}/ssh/import`, {
      method: 'POST',
      body: JSON.stringify({
        connectionId: input.connectionId,
        path: input.path,
        serviceName: input.serviceName,
        nodeName: input.nodeName,
      }),
    })
    return result.file
  },
  async tailSsh(input, onEvent, signal) {
    const response = await authFetch(`/api/logs/sessions/${encodeURIComponent(input.sessionId)}/tail`, {
      method: 'POST',
      body: JSON.stringify({
        connectionId: input.connectionId,
        path: input.path,
        lines: input.lines,
        serviceName: input.serviceName,
        nodeName: input.nodeName,
      }),
      signal,
    })
    if (!response.body) throw new Error('服务器未返回 tail 流')
    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    while (true) {
      const {done, value} = await reader.read()
      if (done) break
      buffer += decoder.decode(value, {stream: true})
      const chunks = buffer.split('\n\n')
      buffer = chunks.pop() ?? ''
      for (const chunk of chunks) {
        const line = chunk.split('\n').find((row) => row.startsWith('data: '))
        if (!line) continue
        onEvent(JSON.parse(line.slice(6)) as TailEvent)
      }
    }
  },
  async search(sessionId, input) {
    const params = new URLSearchParams()
    appendIfPresent(params, 'query', input.query)
    appendIfPresent(params, 'limit', input.limit)
    appendIfPresent(params, 'level', input.level)
    appendIfPresent(params, 'service', input.service)
    appendIfPresent(params, 'nodeKey', input.nodeKey)
    const suffix = params.toString() ? `?${params.toString()}` : ''
    return await json<LogSearchResult>(`/api/logs/sessions/${encodeURIComponent(sessionId)}/search${suffix}`)
  },
  async timeline(sessionId) {
    return await json<{bucketSizeMs: number; buckets: LogBucket[]}>(`/api/logs/sessions/${encodeURIComponent(sessionId)}/timeline`)
  },
  async files(sessionId) {
    return await json<{files: LogSourceFile[]}>(`/api/logs/sessions/${encodeURIComponent(sessionId)}/files`)
  },
  async removeSession(sessionId) {
    await json<void>(`/api/logs/sessions/${encodeURIComponent(sessionId)}`, {method: 'DELETE'})
  },
}
