import type { SavedConnection } from './connections'
import type { RegistryConnection } from './registryTypes'

/** 判断团队连接是否已在个人列表中（优先 teamId，其次 driver+host+port） */
export function isTeamConnectionImported(savedConnections: SavedConnection[], team: RegistryConnection): boolean {
  return savedConnections.some((saved) => {
    if (saved.sourceTeamId === team.id || saved.id === team.id) return true
    return saved.driver === team.driver && saved.host === team.host && saved.port === team.port
  })
}
