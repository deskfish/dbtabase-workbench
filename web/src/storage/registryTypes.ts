import type { SavedConnection } from './connections'

/** 服务端连接配置记录 */
export type RegistryConnection = {
  id: string
  name: string
  driver: 'mysql' | 'postgres'
  host: string
  port: number
  database: string
  user: string
  password?: string
  tlsMode: string
  lastConnectedAt?: number
  sourceTeamId?: string
  sharedBy?: string
  sharedAt?: number
}

export function toSavedConnection(record: RegistryConnection): SavedConnection {
  return {
    id: record.id,
    name: record.name,
    driver: record.driver,
    host: record.host,
    port: record.port,
    database: record.database,
    user: record.user,
    tlsMode: record.tlsMode,
    password: record.password,
    lastConnectedAt: record.lastConnectedAt,
    sourceTeamId: record.sourceTeamId,
  }
}

export function toRegistryConnection(saved: SavedConnection): RegistryConnection {
  return {
    id: saved.id,
    name: saved.name,
    driver: saved.driver,
    host: saved.host,
    port: saved.port,
    database: saved.database,
    user: saved.user,
    tlsMode: saved.tlsMode,
    password: saved.password,
    lastConnectedAt: saved.lastConnectedAt,
  }
}
