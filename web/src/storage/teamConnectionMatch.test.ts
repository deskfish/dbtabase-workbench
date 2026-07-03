import { expect, it } from 'vitest'
import type { SavedConnection } from './connections'
import type { RegistryConnection } from './registryTypes'
import { dedupeTeamConnections, isTeamConnectionImported, isTeamConnectionGroupImported } from './teamConnectionMatch'

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

it('merges team connections on the same host and port', () => {
  const connections: RegistryConnection[] = [
    {...team, id: 'team-a', database: 'channelHub', sharedBy: '孙振东', sharedAt: 2},
    {...team, id: 'team-b', database: 'flybase', sharedBy: '小明星', sharedAt: 3},
  ]
  const groups = dedupeTeamConnections(connections)
  expect(groups).toHaveLength(1)
  expect(groups[0]?.sharedBy).toBe('小明星、孙振东')
  expect(groups[0]?.id).toBe('team-b')
})

it('marks a group imported when any member host matches personal list', () => {
  const groups = dedupeTeamConnections([
    {...team, id: 'team-a', database: 'channelHub'},
    {...team, id: 'team-b', database: 'flybase'},
  ])
  const saved: SavedConnection[] = [{
    id: 'local-1',
    name: '10.10.80.122_pg',
    driver: 'postgres',
    host: '10.10.80.122',
    port: 5432,
    database: 'channelHub',
    user: 'postgres',
    tlsMode: 'disable',
  }]
  expect(isTeamConnectionGroupImported(saved, groups[0]!)).toBe(true)
})
