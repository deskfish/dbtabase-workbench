import type { ConnectionInput, DatabaseObject, MongoCollectionDetail, MongoFindResult, MutationInput, QueryResult, RedisCommandResult, RedisKeyDetail, RedisKeysResult, SchemaOperation, SchemaPreview, TableDetail } from './types'
import type { ConnectionCapabilities } from './driver'
import type { RegistryConnection } from '../storage/registryTypes'

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

export class APIError extends Error {
  constructor(public status: number, public code: string, message: string, public details?: unknown) {
    super(message)
    this.name = 'APIError'
  }
}

export class APIClient {
  private sessionId = ''
  private sessionReady: Promise<string> | null = null

  constructor(
    private readonly baseURL = '',
    private readonly fetcher: Fetcher = (...args) => globalThis.fetch(...args),
    private readonly sessionRetryDelayMs = 250,
  ) {}

  async createSession(): Promise<string> {
    if (this.sessionId) return this.sessionId
    if (this.sessionReady) return this.sessionReady
    this.sessionReady = (async () => {
      let lastError: unknown
      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          const response = await this.fetchWithTimeout(`${this.baseURL}/api/sessions`, {
            method: 'POST',
            headers: {Accept: 'application/json'},
            credentials: 'same-origin',
          })
          if (!response.ok) {
            const payload = await response.json().catch(() => ({})) as {error?:{code?:string; message?:string}}
            throw new APIError(response.status, payload.error?.code ?? 'session_failed', payload.error?.message ?? `请求失败 (${response.status})`)
          }
          const result = await response.json() as {sessionId: string}
          this.sessionId = result.sessionId
          return result.sessionId
        } catch (error) {
          lastError = error
          const status = error instanceof APIError ? error.status : 0
          const transient = status === 0 || status === 408 || status === 429 || status >= 500
          if (!transient || attempt === 2) throw error
          await new Promise(resolve => setTimeout(resolve, this.sessionRetryDelayMs * (attempt + 1)))
        }
      }
      throw lastError
    })().finally(() => {
      this.sessionReady = null
    })
    return this.sessionReady
  }

  async connect(input: ConnectionInput): Promise<{connectionId: string; database: string}> {
    return this.request<{connectionId:string; database:string}>('/api/connections', {method:'POST', body:JSON.stringify(input)})
  }

  async disconnect(connectionId: string): Promise<void> {
    await this.request<void>(`/api/connections/${encodeURIComponent(connectionId)}`, {method:'DELETE'})
  }

  async listDatabases(connectionId: string): Promise<{databases: string[]; current: string}> {
    return this.request(`/api/connections/${encodeURIComponent(connectionId)}/databases`)
  }

  async switchDatabase(connectionId: string, database: string): Promise<string> {
    const result = await this.request<{database:string}>(`/api/connections/${encodeURIComponent(connectionId)}/database`, {
      method: 'POST',
      body: JSON.stringify({database}),
    })
    return result.database
  }

  async metadata(connectionId: string): Promise<DatabaseObject[]> {
    const result = await this.request<{objects:DatabaseObject[]}>(`/api/connections/${encodeURIComponent(connectionId)}/metadata`)
    return result.objects ?? []
  }

  tableDetail(connectionId:string,schema:string,table:string):Promise<TableDetail>{return this.request(`/api/connections/${encodeURIComponent(connectionId)}/tables/${encodeURIComponent(schema)}/${encodeURIComponent(table)}`)}
  previewSchema(connectionId:string,schema:string,table:string,operations:SchemaOperation[]):Promise<SchemaPreview>{return this.request(`/api/connections/${encodeURIComponent(connectionId)}/tables/${encodeURIComponent(schema)}/${encodeURIComponent(table)}/schema/preview`,{method:'POST',body:JSON.stringify({operations})})}
  executeSchema(connectionId:string,schema:string,table:string,token:string,confirmed:boolean):Promise<{results:{sql:string;status:string;error?:string}[]}>{return this.request(`/api/connections/${encodeURIComponent(connectionId)}/tables/${encodeURIComponent(schema)}/${encodeURIComponent(table)}/schema/execute`,{method:'POST',body:JSON.stringify({token,confirmed})})}

  async startQuery(connectionId: string, sql: string, options: {confirmed?:boolean; confirmationTarget?:string; transactionId?:string} = {}): Promise<string> {
    const result = await this.request<{queryId:string}>(`/api/connections/${encodeURIComponent(connectionId)}/queries`, {method:'POST', body:JSON.stringify({sql, ...options})})
    return result.queryId
  }

  queryResult(connectionId: string, queryId: string, cursor = 0): Promise<QueryResult> {
    return this.request(`/api/connections/${encodeURIComponent(connectionId)}/queries/${encodeURIComponent(queryId)}?cursor=${cursor}`)
  }

  async cancelQuery(connectionId: string, queryId: string): Promise<void> {
    await this.request<void>(`/api/connections/${encodeURIComponent(connectionId)}/queries/${encodeURIComponent(queryId)}`, {method:'DELETE'})
  }

  exportURL(connectionId: string, queryId: string): string {
    return `${this.baseURL}/api/connections/${encodeURIComponent(connectionId)}/queries/${encodeURIComponent(queryId)}/export.csv`
  }

  async exportCSV(connectionId: string, queryId: string): Promise<Blob> {
    return this.exportCSVWithRetry(connectionId, queryId, false)
  }

  private async exportCSVWithRetry(connectionId: string, queryId: string, sessionRetried: boolean): Promise<Blob> {
    await this.createSession()
    const response = await this.fetcher(`${this.baseURL}/api/connections/${encodeURIComponent(connectionId)}/queries/${encodeURIComponent(queryId)}/export.csv`, {
      headers: {'X-Session-ID': this.sessionId, 'Accept':'text/csv'},
    })
    if (!response.ok) {
      const payload = await response.json().catch(() => ({})) as {error?:{code?:string}}
      if (!sessionRetried && response.status === 401 && payload.error?.code === 'invalid_session') {
        this.invalidateSession()
        return this.exportCSVWithRetry(connectionId, queryId, true)
      }
      throw new APIError(response.status, 'export_failed', '导出失败')
    }
    return response.blob()
  }

  async beginTransaction(connectionId: string): Promise<string> {
    const result = await this.request<{transactionId:string}>(`/api/connections/${encodeURIComponent(connectionId)}/transactions`, {method:'POST'})
    return result.transactionId
  }

  async finishTransaction(connectionId: string, transactionId: string, action: 'commit'|'rollback'): Promise<void> {
    await this.request<void>(`/api/connections/${encodeURIComponent(connectionId)}/transactions/${encodeURIComponent(transactionId)}/${action}`, {method:'POST'})
  }

  async mutate(connectionId: string, operation: 'insert'|'update'|'delete', input: MutationInput): Promise<void> {
    await this.request(`/api/connections/${encodeURIComponent(connectionId)}/rows/${operation}`, {method:'POST', body:JSON.stringify(input)})
  }

  capabilities(connectionId: string): Promise<ConnectionCapabilities> {
    return this.request(`/api/connections/${encodeURIComponent(connectionId)}/capabilities`)
  }

  mongoFind(connectionId: string, input: {database?: string; collection: string; filter?: string; sort?: string; limit?: number; skip?: number}): Promise<MongoFindResult> {
    return this.request(`/api/connections/${encodeURIComponent(connectionId)}/mongo/find`, {
      method: 'POST',
      body: JSON.stringify({
        ...input,
        filter: input.filter ? JSON.parse(input.filter) : {},
        sort: input.sort ? JSON.parse(input.sort) : undefined,
      }),
    })
  }

  mongoAggregate(connectionId: string, input: {database?: string; collection: string; pipeline: string}): Promise<MongoFindResult> {
    const pipeline = JSON.parse(input.pipeline) as unknown[]
    return this.request(`/api/connections/${encodeURIComponent(connectionId)}/mongo/aggregate`, {
      method: 'POST',
      body: JSON.stringify({database: input.database, collection: input.collection, pipeline}),
    })
  }

  mongoMutate(connectionId: string, input: {database?: string; collection: string; operation: string; filter?: string; document?: string}): Promise<{affected: number}> {
    return this.request(`/api/connections/${encodeURIComponent(connectionId)}/mongo/documents`, {
      method: 'POST',
      body: JSON.stringify({
        database: input.database,
        collection: input.collection,
        operation: input.operation,
        filter: input.filter ? JSON.parse(input.filter) : undefined,
        document: input.document ? JSON.parse(input.document) : undefined,
      }),
    })
  }

  mongoCollectionDetail(connectionId: string, collection: string): Promise<MongoCollectionDetail> {
    return this.request(`/api/connections/${encodeURIComponent(connectionId)}/mongo/collections/${encodeURIComponent(collection)}`)
  }

  mongoCreateIndex(connectionId: string, collection: string, keys: Record<string, number>, unique: boolean, name?: string): Promise<{name: string}> {
    return this.request(`/api/connections/${encodeURIComponent(connectionId)}/mongo/collections/${encodeURIComponent(collection)}/indexes`, {
      method: 'POST',
      body: JSON.stringify({keys, unique, name}),
    })
  }

  mongoDropIndex(connectionId: string, collection: string, name: string): Promise<void> {
    return this.request(`/api/connections/${encodeURIComponent(connectionId)}/mongo/collections/${encodeURIComponent(collection)}/indexes/${encodeURIComponent(name)}`, {method: 'DELETE'})
  }

  redisScanKeys(connectionId: string, match = '*', cursor = 0, count = 200): Promise<RedisKeysResult> {
    const params = new URLSearchParams({match, cursor: String(cursor), count: String(count)})
    return this.request(`/api/connections/${encodeURIComponent(connectionId)}/redis/keys?${params}`)
  }

  redisGetKey(connectionId: string, key: string): Promise<RedisKeyDetail> {
    return this.request(`/api/connections/${encodeURIComponent(connectionId)}/redis/key?key=${encodeURIComponent(key)}`)
  }

  redisSaveKey(connectionId: string, key: string, value: {type: string; value: unknown; ttl?: number}): Promise<void> {
    return this.request(`/api/connections/${encodeURIComponent(connectionId)}/redis/key`, {
      method: 'PUT',
      body: JSON.stringify({key, value}),
    })
  }

  redisDeleteKey(connectionId: string, key: string): Promise<void> {
    return this.request(`/api/connections/${encodeURIComponent(connectionId)}/redis/key?key=${encodeURIComponent(key)}`, {method: 'DELETE'})
  }

  redisSetTTL(connectionId: string, key: string, ttl: number): Promise<void> {
    return this.request(`/api/connections/${encodeURIComponent(connectionId)}/redis/key/ttl`, {
      method: 'POST',
      body: JSON.stringify({key, ttl}),
    })
  }

  redisCommands(connectionId: string, commands: string[]): Promise<RedisCommandResult> {
    return this.request(`/api/connections/${encodeURIComponent(connectionId)}/redis/commands`, {
      method: 'POST',
      body: JSON.stringify({commands}),
    })
  }

  async listPersonalConnections(nickname: string): Promise<RegistryConnection[]> {
    const result = await this.request<{connections: RegistryConnection[]}>('/api/registry/personal/connections', {headers: this.registryHeaders(nickname)})
    return result.connections ?? []
  }

  async upsertPersonalConnection(nickname: string, connection: RegistryConnection): Promise<RegistryConnection> {
    const result = await this.request<{connection: RegistryConnection}>('/api/registry/personal/connections', {
      method: 'POST',
      headers: this.registryHeaders(nickname),
      body: JSON.stringify(connection),
    })
    return result.connection
  }

  async deletePersonalConnection(nickname: string, id: string): Promise<void> {
    await this.request<void>(`/api/registry/personal/connections/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: this.registryHeaders(nickname),
    })
  }

  async migratePersonalConnections(nickname: string, connections: RegistryConnection[]): Promise<RegistryConnection[]> {
    const result = await this.request<{connections: RegistryConnection[]}>('/api/registry/personal/migrate', {
      method: 'POST',
      headers: this.registryHeaders(nickname),
      body: JSON.stringify({connections}),
    })
    return result.connections ?? []
  }

  async listTeamConnections(nickname: string): Promise<RegistryConnection[]> {
    const result = await this.request<{connections: RegistryConnection[]}>('/api/registry/team/connections', {headers: this.registryHeaders(nickname)})
    return result.connections ?? []
  }

  async shareConnectionToTeam(nickname: string, personalConnectionId: string): Promise<RegistryConnection> {
    const result = await this.request<{connection: RegistryConnection}>('/api/registry/team/connections', {
      method: 'POST',
      headers: this.registryHeaders(nickname),
      body: JSON.stringify({personalConnectionId}),
    })
    return result.connection
  }

  async copyTeamConnection(nickname: string, teamConnectionId: string): Promise<RegistryConnection> {
    const result = await this.request<{connection: RegistryConnection}>(`/api/registry/team/connections/${encodeURIComponent(teamConnectionId)}/copy`, {
      method: 'POST',
      headers: this.registryHeaders(nickname),
    })
    return result.connection
  }

  private registryHeaders(nickname: string): HeadersInit {
    // HTTP 头只允许 ISO-8859-1，中文昵称需编码后再传
    return {'X-User-Nickname': encodeURIComponent(nickname.trim())}
  }

  private async fetchWithTimeout(input: RequestInfo | URL, init: RequestInit = {}, timeoutMs = 15000): Promise<Response> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      return await this.fetcher(input, {...init, signal: controller.signal})
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new APIError(408, 'request_timeout', '请求超时，请检查网络后重试')
      }
      throw error
    } finally {
      clearTimeout(timer)
    }
  }

  /** 服务端重启后会话失效时，丢弃本地缓存并重新创建 */
  private invalidateSession(): void {
    this.sessionId = ''
    this.sessionReady = null
  }

  private async request<T>(path: string, init: RequestInit = {}, authenticated = true, sessionRetried = false): Promise<T> {
    if (authenticated) await this.createSession()
    const headers = new Headers(init.headers)
    headers.set('Accept', 'application/json')
    if (init.body) headers.set('Content-Type', 'application/json')
    if (authenticated) headers.set('X-Session-ID', this.sessionId)
    const response = await this.fetchWithTimeout(this.baseURL + path, {...init, headers})
    if (!response.ok) {
      const payload = await response.json().catch(() => ({})) as {error?:{code?:string; message?:string}}
      const code = payload.error?.code ?? 'request_failed'
      if (authenticated && !sessionRetried && response.status === 401 && code === 'invalid_session') {
        this.invalidateSession()
        return this.request<T>(path, init, authenticated, true)
      }
      throw new APIError(response.status, code, payload.error?.message ?? `请求失败 (${response.status})`, payload.error)
    }
    if (response.status === 204) return undefined as T
    return response.json() as Promise<T>
  }
}
