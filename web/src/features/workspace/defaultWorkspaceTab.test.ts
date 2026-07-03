import { expect, it } from 'vitest'
import { createDefaultWorkspaceTab } from './types'

it('creates a redis console tab for redis connections', () => {
  const {tab, nextRedisConsoleCounter} = createDefaultWorkspaceTab('redis', 'SELECT 1', 2)
  expect(tab.kind).toBe('redis-console')
  expect(nextRedisConsoleCounter).toBe(3)
})

it('creates a mongo home tab for mongodb connections', () => {
  const {tab} = createDefaultWorkspaceTab('mongodb', 'SELECT 1', 2)
  expect(tab.kind).toBe('driver-home')
  expect(tab).toMatchObject({driver: 'mongodb'})
})

it('creates a sql query tab for postgres connections', () => {
  const {tab} = createDefaultWorkspaceTab('postgres', 'SELECT 1', 2)
  expect(tab.kind).toBe('query')
})
