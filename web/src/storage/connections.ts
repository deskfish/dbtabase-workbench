import { openDB } from 'idb'

export type SavedConnection = {
  /** 本地连接 ID */
  id: string
  /** 连接名称 */
  name: string
  /** 数据库驱动 */
  driver: 'mysql' | 'postgres' | 'mongodb' | 'redis'
  /** 主机地址 */
  host: string
  /** 端口 */
  port: number
  /** 数据库名 */
  database: string
  /** 用户名 */
  user: string
  /** TLS 模式 */
  tlsMode: string
  /** 数据库密码，仅保存在本机 IndexedDB */
  password?: string
  /** 服务端是否存有密码（解密失败时用于提示补录） */
  hasPassword?: boolean
  /** 最近连接时间戳 */
  lastConnectedAt?: number
  /** 来源团队连接 ID */
  sourceTeamId?: string
}

const database = openDB('database-workbench', 2, {
  upgrade(db, oldVersion) {
    if (oldVersion > 0 && oldVersion < 2 && db.objectStoreNames.contains('connections')) {
      db.deleteObjectStore('connections')
    }
    if (!db.objectStoreNames.contains('connections')) {
      db.createObjectStore('connections', {keyPath: 'id'})
    }
  },
})

export async function saveConnection(connection: SavedConnection): Promise<void> {
  const db = await database
  await db.put('connections', structuredClone(connection))
}

/** 连接列表固定按名称排序；同名时按主机、端口、驱动稳定排序，避免点击后跳位 */
export function sortConnectionsByName(connections: SavedConnection[]): SavedConnection[] {
  return [...connections].sort((a, b) => {
    const byName = a.name.localeCompare(b.name, 'zh-CN')
    if (byName !== 0) return byName
    const byHost = a.host.localeCompare(b.host)
    if (byHost !== 0) return byHost
    if (a.port !== b.port) return a.port - b.port
    return a.driver.localeCompare(b.driver)
  })
}

export async function listConnections(): Promise<SavedConnection[]> {
  const db = await database
  const records = await db.getAll('connections') as SavedConnection[]
  return sortConnectionsByName(records)
}

export async function touchConnection(id: string): Promise<void> {
  const db = await database
  const record = await db.get('connections', id) as SavedConnection | undefined
  if (!record) return
  record.lastConnectedAt = Date.now()
  await db.put('connections', record)
}

export async function deleteConnection(id: string): Promise<void> {
  const db = await database
  await db.delete('connections', id)
}

export async function clearConnections(): Promise<void> {
  const db = await database
  await db.clear('connections')
}
