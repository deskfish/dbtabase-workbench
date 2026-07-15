import {describe, expect, it} from 'vitest'
import type {Connection} from '../../connections/types'
import {toWorkbenchTarget} from './connectionAdapter'

const connection: Connection = {
  id: 'conn_saved',
  name: 'Primary',
  kind: 'database',
  driver: 'postgres',
  scope: 'personal',
  endpoint: {host: 'db.internal', port: 5432},
  config: {database: 'app', tlsMode: 'prefer'},
  hasSecret: true,
}

describe('toWorkbenchTarget', () => {
  it('maps a redacted v2 database connection without inventing credentials', () => {
    expect(toWorkbenchTarget(connection)).toEqual({
      id: 'conn_saved',
      name: 'Primary',
      driver: 'postgres',
      scope: 'personal',
      teamId: undefined,
      host: 'db.internal',
      port: 5432,
      database: 'app',
      hasSecret: true,
    })
    expect(toWorkbenchTarget(connection)).not.toHaveProperty('password')
    expect(toWorkbenchTarget(connection)).not.toHaveProperty('user')
  })

  it('rejects SSH records at the workbench boundary', () => {
    expect(() => toWorkbenchTarget({...connection, kind: 'ssh', driver: 'ssh'})).toThrow('数据库工作台仅支持数据库连接')
  })
})
