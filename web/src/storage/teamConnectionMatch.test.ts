import { expect, it } from 'vitest'
import type { SavedConnection } from './connections'
import type { RegistryConnection } from './registryTypes'
import { isTeamConnectionImported } from './teamConnectionMatch'

const team: RegistryConnection = {
  id: 'team-1',
  name: '10.10.80.122_pg',
  driver: 'postgres',
  host: '10.10.80.122',
  port: 5432,
  database: 'flybase',
  user: 'postgres',
  tlsMode: 'disable',
  sharedBy: '小明星',
}

it('matches imported team by sourceTeamId', () => {
  const saved: SavedConnection[] = [{
    id: 'import:1',
    name: 'copy',
    driver: 'postgres',
    host: '10.10.80.122',
    port: 5432,
    database: 'flybase',
    user: 'postgres',
    tlsMode: 'disable',
    sourceTeamId: 'team-1',
  }]
  expect(isTeamConnectionImported(saved, team)).toBe(true)
})

it('matches personal connection by host and port even without sourceTeamId', () => {
  const saved: SavedConnection[] = [{
    id: 'local-1',
    name: '10.10.80.122_pg',
    driver: 'postgres',
    host: '10.10.80.122',
    port: 5432,
    database: 'flybase',
    user: 'postgres',
    tlsMode: 'disable',
  }]
  expect(isTeamConnectionImported(saved, team)).toBe(true)
})

it('does not match different host or port', () => {
  const saved: SavedConnection[] = [{
    id: 'local-2',
    name: 'other',
    driver: 'postgres',
    host: '192.168.6.100',
    port: 5432,
    database: 'channelHub',
    user: 'postgres',
    tlsMode: 'disable',
  }]
  expect(isTeamConnectionImported(saved, team)).toBe(false)
})
