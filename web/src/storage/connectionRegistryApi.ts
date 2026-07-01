import type { RegistryConnection } from './registryTypes'

/** 连接配置同步所需 API 能力 */
export type ConnectionRegistryAPI = {
  listPersonalConnections(nickname: string): Promise<RegistryConnection[]>
  upsertPersonalConnection(nickname: string, connection: RegistryConnection): Promise<RegistryConnection>
  deletePersonalConnection(nickname: string, id: string): Promise<void>
  migratePersonalConnections(nickname: string, connections: RegistryConnection[]): Promise<RegistryConnection[]>
  listTeamConnections(nickname: string): Promise<RegistryConnection[]>
  shareConnectionToTeam(nickname: string, personalConnectionId: string): Promise<RegistryConnection>
  copyTeamConnection(nickname: string, teamConnectionId: string): Promise<RegistryConnection>
}
