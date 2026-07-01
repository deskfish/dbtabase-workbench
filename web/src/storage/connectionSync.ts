import type { ConnectionRegistryAPI } from './connectionRegistryApi'
import {
  clearConnections as clearLocalConnections,
  deleteConnection as deleteLocalConnection,
  listConnections as listLocalConnections,
  saveConnection as saveLocalConnection,
  type SavedConnection,
} from './connections'
import { toRegistryConnection, toSavedConnection } from './registryTypes'

/** 从服务端拉取个人连接；若服务端为空则自动迁移浏览器本地配置 */
export async function syncPersonalConnections(api: ConnectionRegistryAPI, nickname: string): Promise<SavedConnection[]> {
  const owner = nickname.trim()
  if (!owner) return listLocalConnections()

  const remote = await api.listPersonalConnections(owner)
  if (remote.length > 0) {
    return remote.map(toSavedConnection)
  }

  const local = await listLocalConnections()
  if (local.length === 0) return []

  const migrated = await api.migratePersonalConnections(owner, local.map(toRegistryConnection))
  await clearLocalConnections()
  return migrated.map(toSavedConnection)
}

export async function persistConnection(api: ConnectionRegistryAPI, nickname: string, connection: SavedConnection): Promise<void> {
  const owner = nickname.trim()
  if (!owner) {
    await saveLocalConnection(connection)
    return
  }
  await api.upsertPersonalConnection(owner, toRegistryConnection(connection))
}

export async function removeConnection(api: ConnectionRegistryAPI, nickname: string, id: string): Promise<void> {
  const owner = nickname.trim()
  if (!owner) {
    await deleteLocalConnection(id)
    return
  }
  await api.deletePersonalConnection(owner, id)
}

export async function listTeamConnections(api: ConnectionRegistryAPI, nickname: string) {
  const owner = nickname.trim()
  if (!owner) return []
  return api.listTeamConnections(owner)
}

export async function shareConnectionToTeam(api: ConnectionRegistryAPI, nickname: string, personalConnectionId: string) {
  return api.shareConnectionToTeam(nickname, personalConnectionId)
}

export async function copyTeamConnection(api: ConnectionRegistryAPI, nickname: string, teamConnectionId: string) {
  const copied = await api.copyTeamConnection(nickname, teamConnectionId)
  return toSavedConnection(copied)
}
