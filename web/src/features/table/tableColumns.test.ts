import { expect, it } from 'vitest'
import { preserveResultColumns, resolveTableColumns } from './tableColumns'
import { tableObject } from '../workspace/tableTabLoader'

const table = tableObject('public', 'channel')

it('falls back to metadata columns when query result has no columns', () => {
  const columns = resolveTableColumns(table, {queryId: 'q1', durationMs: 1, rows: []}, [
    {kind: 'column', schema: 'public', parent: 'channel', name: 'id', dataType: 'bigint'},
    {kind: 'column', schema: 'public', parent: 'channel', name: 'name', dataType: 'text'},
  ])
  expect(columns).toEqual([
    {name: 'id', dataType: 'bigint'},
    {name: 'name', dataType: 'text'},
  ])
})

it('prefers query result columns over metadata', () => {
  const columns = resolveTableColumns(table, {
    queryId: 'q1',
    durationMs: 1,
    columns: [{name: 'id', databaseType: 'integer'}],
    rows: [],
  }, [
    {kind: 'column', schema: 'public', parent: 'channel', name: 'legacy', dataType: 'text'},
  ])
  expect(columns).toEqual([{name: 'id', dataType: 'integer'}])
})

it('keeps previous columns when next page omits them', () => {
  const merged = preserveResultColumns(
    {queryId: 'old', durationMs: 1, columns: [{name: 'id', databaseType: 'bigint'}], rows: [[1]]},
    {queryId: 'new', durationMs: 2, rows: []},
  )
  expect(merged.columns).toEqual([{name: 'id', databaseType: 'bigint'}])
  expect(merged.rows).toEqual([])
})
