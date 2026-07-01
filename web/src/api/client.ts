import type { ConnectionInput, DatabaseObject, MutationInput, QueryResult } from './types'
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

  constructor(private readonly baseURL = '', private readonly fetcher: Fetcher = (...args) => globalThis.fetch(...args)) {}

  async createSession(): Promise<string> {
    if (this.sessionId) return this.sessionId
    if (this.sessionReady) return this.sessionReady
    this.sessionReady = (async () => {
      const response = await this.fetcher(`${this.baseURL}/api/sessions`, {
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
    return result.objects
  }

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
    await this.createSession()
    const response = await this.fetcher(`${this.baseURL}/api/connections/${encodeURIComponent(connectionId)}/queries/${encodeURIComponent(queryId)}/export.csv`, {
      headers: {'X-Session-ID': this.sessionId, 'Accept':'text/csv'},
    })
    if (!response.ok) throw new APIError(response.status, 'export_failed', '导出失败')
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

  private async request<T>(path: string, init: RequestInit = {}, authenticated = true): Promise<T> {
    if (authenticated) await this.createSession()
    const headers = new Headers(init.headers)
    headers.set('Accept', 'application/json')
    if (init.body) headers.set('Content-Type', 'application/json')
    if (authenticated) headers.set('X-Session-ID', this.sessionId)
    const response = await this.fetchWithTimeout(this.baseURL + path, {...init, headers})
    if (!response.ok) {
      const payload = await response.json().catch(() => ({})) as {error?:{code?:string; message?:string}}
      throw new APIError(response.status, payload.error?.code ?? 'request_failed', payload.error?.message ?? `请求失败 (${response.status})`, payload.error)
    }
    if (response.status === 204) return undefined as T
    return response.json() as Promise<T>
  }
}
