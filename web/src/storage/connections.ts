import { openDB } from 'idb'
import type { EncryptedSecret } from '../crypto/vault'

export type SavedConnection = {
  id: string
  name: string
  driver: 'mysql' | 'postgres'
  host: string
  port: number
  database: string
  user: string
  tlsMode: string
  encryptedPassword?: EncryptedSecret
}

const database = openDB('database-workbench', 1, {
  upgrade(db) {
    db.createObjectStore('connections', {keyPath: 'id'})
  },
})

export async function saveConnection(connection: SavedConnection): Promise<void> {
  const db = await database
  await db.put('connections', structuredClone(connection))
}

export async function listConnections(): Promise<SavedConnection[]> {
  const db = await database
  const records = await db.getAll('connections') as SavedConnection[]
  return records.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'))
}

export async function deleteConnection(id: string): Promise<void> {
  const db = await database
  await db.delete('connections', id)
}

export async function clearConnections(): Promise<void> {
  const db = await database
  await db.clear('connections')
}
