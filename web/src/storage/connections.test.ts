import { beforeEach, describe, expect, it } from 'vitest'
import { clearConnections, deleteConnection, listConnections, saveConnection, touchConnection } from './connections'

describe('saved connections', () => {
  beforeEach(async () => clearConnections())

  it('stores and lists a saved connection', async () => {
    await saveConnection({
      id: 'local-1', name: 'Reporting', driver: 'postgres', host: 'db.internal', port: 5432,
      database: 'reports', user: 'analyst', tlsMode: 'prefer', password: 'secret', lastConnectedAt: 10,
    })
    await saveConnection({
      id: 'local-2', name: 'Orders', driver: 'mysql', host: 'db.internal', port: 3306,
      database: 'orders', user: 'analyst', tlsMode: 'disabled', password: 'secret', lastConnectedAt: 20,
    })
    const saved = await listConnections()
    expect(saved.map((item) => item.name)).toEqual(['Orders', 'Reporting'])
  })

  it('updates last connected time', async () => {
    await saveConnection({id:'one', name:'One', driver:'mysql', host:'db', port:3306, database:'x', user:'u', tlsMode:'disabled', password:'p', lastConnectedAt:1})
    await touchConnection('one')
    const saved = await listConnections()
    expect(saved[0].lastConnectedAt).toBeGreaterThan(1)
  })

  it('deletes a connection by id', async () => {
    await saveConnection({id:'one', name:'One', driver:'mysql', host:'db', port:3306, database:'x', user:'u', tlsMode:'disabled', password:'p'})
    await deleteConnection('one')
    expect(await listConnections()).toEqual([])
  })
})
