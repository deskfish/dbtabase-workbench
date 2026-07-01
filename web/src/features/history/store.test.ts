import { beforeEach, expect, it } from 'vitest'
import { addHistory, clearHistory, listHistory, toggleFavorite } from './store'

beforeEach(() => clearHistory())

it('stores newest query first without credentials', () => {
  addHistory({sql:'SELECT 1', connectionName:'Reports', database:'analytics', durationMs:4, status:'success', affectedRows:0})
  const entries = listHistory()
  expect(entries).toHaveLength(1)
  expect(entries[0].sql).toBe('SELECT 1')
  expect(JSON.stringify(entries[0])).not.toContain('password')
})

it('caps history at five hundred entries', () => {
  for (let index = 0; index < 510; index += 1) addHistory({sql:`SELECT ${index}`, connectionName:'DB', status:'success'})
  expect(listHistory()).toHaveLength(500)
  expect(listHistory()[0].sql).toBe('SELECT 509')
})

it('toggles a favorite', () => {
  const entry = addHistory({sql:'SELECT 1', connectionName:'DB', status:'success'})
  toggleFavorite(entry.id)
  expect(listHistory()[0].favorite).toBe(true)
})
