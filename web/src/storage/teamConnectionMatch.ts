import type { SavedConnection } from './connections'
import type { RegistryConnection } from './registryTypes'

/** 团队连接唯一标识：同一实例不区分默认库 */
export function teamConnectionKey(team: Pick<RegistryConnection, 'driver' | 'host' | 'port'>): string {
  return `${team.driver}|${team.host}|${team.port}`
}

/** 合并同一服务器上的团队共享连接 */
export type TeamConnectionGroup = {
  key: string
  id: string
  name: string
  driver: RegistryConnection['driver']
  host: string
  port: number
  user: string
  sharedBy: string
  members: RegistryConnection[]
}

export function dedupeTeamConnections(connections: RegistryConnection[]): TeamConnectionGroup[] {
  const groups = new Map<string, RegistryConnection[]>()
  for (const item of connections) {
    const key = teamConnectionKey(item)
    groups.set(key, [...(groups.get(key) ?? []), item])
  }
  return [...groups.values()].map((members) => {
    const sorted = [...members].sort((left, right) => (right.sharedAt ?? 0) - (left.sharedAt ?? 0))
    const primary = sorted[0]
    const sharers = [...new Set(sorted.map((member) => member.sharedBy).filter(Boolean))] as string[]
    return {
      key: teamConnectionKey(primary),
      id: primary.id,
      name: primary.name,
      driver: primary.driver,
      host: primary.host,
      port: primary.port,
      user: primary.user,
      sharedBy: sharers.length ? sharers.join('、') : '团队',
      members,
    }
  })
}

/** 判断团队连接是否已在个人列表中（优先 teamId，其次 driver+host+port） */
export function isTeamConnectionImported(savedConnections: SavedConnection[], team: RegistryConnection): boolean {
  return savedConnections.some((saved) => {
    if (saved.sourceTeamId === team.id || saved.id === team.id) return true
    return saved.driver === team.driver && saved.host === team.host && saved.port === team.port
  })
}

/** 判断合并后的团队连接组是否已在个人列表中 */
export function isTeamConnectionGroupImported(savedConnections: SavedConnection[], group: TeamConnectionGroup): boolean {
  return group.members.some((member) => isTeamConnectionImported(savedConnections, member))
}
