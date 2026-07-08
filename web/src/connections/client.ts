import { json } from '../auth/client'
import type { Connection, ConnectionFilters, SaveInput } from './types'

function filteredPath(filters: ConnectionFilters = {}): string {
  const params = new URLSearchParams()
  if (filters.kind) params.set('kind', filters.kind)
  if (filters.scope) params.set('scope', filters.scope)
  const query = params.toString()
  return `/api/registry/v2/connections${query ? `?${query}` : ''}`
}

export type ConnectionsClient = {
  list(filters?: ConnectionFilters): Promise<Connection[]>
  create(input: SaveInput): Promise<Connection>
  update(id: string, input: SaveInput): Promise<Connection>
  remove(id: string): Promise<void>
}

export const connectionsClient: ConnectionsClient = {
  async list(filters) {
    const result = await json<{connections: Connection[]}>(filteredPath(filters))
    return result.connections ?? []
  },
  async create(input) {
    const result = await json<{connection: Connection}>('/api/registry/v2/connections', {
      method: 'POST',
      body: JSON.stringify(input),
    })
    return result.connection
  },
  async update(id, input) {
    const result = await json<{connection: Connection}>(`/api/registry/v2/connections/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify(input),
    })
    return result.connection
  },
  async remove(id) {
    await json<void>(`/api/registry/v2/connections/${encodeURIComponent(id)}`, {method: 'DELETE'})
  },
}
