import type { ConnectionInput, DatabaseObject, MutationInput, QueryResult } from './types'

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

export class APIError extends Error {
  constructor(public status: number, public code: string, message: string, public details?: unknown) {
    super(message)
    this.name = 'APIError'
  }
}

export class APIClient {
  private sessionId = ''

  constructor(private readonly baseURL = '', private readonly fetcher: Fetcher = fetch) {}

  async createSession(): Promise<string> {
    const result = await this.request<{sessionId:string}>('/api/sessions', {method:'POST'}, false)
    this.sessionId = result.sessionId
    return result.sessionId
  }

  async connect(input: ConnectionInput): Promise<string> {
    const result = await this.request<{connectionId:string}>('/api/connections', {method:'POST', body:JSON.stringify(input)})
    return result.connectionId
  }

  async disconnect(connectionId: string): Promise<void> {
    await this.request<void>(`/api/connections/${encodeURIComponent(connectionId)}`, {method:'DELETE'})
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

  private async request<T>(path: string, init: RequestInit = {}, authenticated = true): Promise<T> {
    const headers = new Headers(init.headers)
    headers.set('Accept', 'application/json')
    if (init.body) headers.set('Content-Type', 'application/json')
    if (authenticated) {
      if (!this.sessionId) throw new APIError(401, 'session_required', '匿名会话尚未建立')
      headers.set('X-Session-ID', this.sessionId)
    }
    const response = await this.fetcher(this.baseURL + path, {...init, headers})
    if (!response.ok) {
      const payload = await response.json().catch(() => ({})) as {error?:{code?:string; message?:string}}
      throw new APIError(response.status, payload.error?.code ?? 'request_failed', payload.error?.message ?? `请求失败 (${response.status})`, payload.error)
    }
    if (response.status === 204) return undefined as T
    return response.json() as Promise<T>
  }
}
