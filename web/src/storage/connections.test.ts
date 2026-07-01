import { beforeEach, describe, expect, it } from 'vitest'
import { clearConnections, deleteConnection, listConnections, saveConnection } from './connections'

describe('saved connections', () => {
  beforeEach(async () => clearConnections())

  it('stores and lists an encrypted connection without plaintext passwords', async () => {
    await saveConnection({
      id: 'local-1', name: 'Reporting', driver: 'postgres', host: 'db.internal', port: 5432,
      database: 'reports', user: 'analyst', tlsMode: 'prefer', encryptedPassword: {
        version: 1,
        kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations: 600_000, salt: 'salt' },
        cipher: { name: 'AES-GCM', iv: 'iv', ciphertext: 'ciphertext' },
      },
    })
    const saved = await listConnections()
    expect(saved).toHaveLength(1)
    expect(saved[0].name).toBe('Reporting')
    expect(JSON.stringify(saved[0])).not.toContain('db-password')
  })

  it('deletes a connection by id', async () => {
    await saveConnection({id:'one', name:'One', driver:'mysql', host:'db', port:3306, database:'x', user:'u', tlsMode:'disabled'})
    await deleteConnection('one')
    expect(await listConnections()).toEqual([])
  })
})
