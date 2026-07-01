import { expect, it } from 'vitest'
import { createQueryTab, tableTabId, type TableTab } from './types'
import { prepareTableTabReload, tableObject } from './tableTabLoader'

const callRecording = tableObject('public', 'call_recording')
const channel = tableObject('public', 'channel')

it('creates a table tab and snapshot in one synchronous step', () => {
  const prepared = prepareTableTabReload([createQueryTab()], tableTabId(callRecording), 'postgres', {table: callRecording})
  expect(prepared).not.toBeNull()
  expect(prepared!.tabs).toHaveLength(2)
  expect(prepared!.snapshot.status).toBe('running')
  expect(prepared!.snapshot.sql).toContain('public.call_recording')
  expect(prepared!.snapshot.sql).toContain('LIMIT 200 OFFSET 0')
})

it('updates an existing table tab without requiring table object', () => {
  const first = prepareTableTabReload([], tableTabId(channel), 'postgres', {table: channel})
  first!.tabs[0] = {
    ...first!.tabs[0] as TableTab,
    result: {
      queryId: 'q1',
      durationMs: 1,
      columns: [{name: 'id', databaseType: 'bigint'}],
      rows: [[1]],
    },
  }
  const second = prepareTableTabReload(first!.tabs, tableTabId(channel), 'postgres', {overrides: {page: 2}})
  expect(second!.tabs).toHaveLength(1)
  expect(second!.snapshot.page).toBe(2)
  expect(second!.snapshot.result?.columns).toEqual([{name: 'id', databaseType: 'bigint'}])
  expect(second!.snapshot.result?.rows).toEqual([])
  expect(second!.snapshot.sql).toContain('OFFSET 200')
})

it('returns null when tab is missing and table object is not provided', () => {
  expect(prepareTableTabReload([], tableTabId(callRecording), 'postgres')).toBeNull()
})
