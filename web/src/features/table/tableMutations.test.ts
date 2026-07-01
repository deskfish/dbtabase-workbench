import { expect, it } from 'vitest'
import { buildRowUpdate, coerceCellValue, compactDraft, hasEffectiveDraftChanges, valuesEqual } from './tableMutations'
import type {TableDraft} from './tableViewState'

const columns = [
  {name: 'id', dataType: 'bigint'},
  {name: 'name', dataType: 'character varying'},
  {name: 'enabled', dataType: 'boolean'},
]

it('only sends changed non-key columns', () => {
  const payload = buildRowUpdate(columns, [1, 'Ada', true], {id: '1', name: 'Bob', enabled: true}, ['id'])
  expect(payload).toEqual({key: {id: 1}, values: {name: 'Bob'}})
})

it('does not treat stringified id in edited row as an update', () => {
  const payload = buildRowUpdate(columns, [1, 'Ada', true], {id: '1', name: 'Ada', enabled: true}, ['id'])
  expect(payload).toBeNull()
})

it('coerces numeric and boolean cell input', () => {
  expect(coerceCellValue('42', 'bigint')).toBe(42)
  expect(coerceCellValue('true', 'boolean')).toBe(true)
  expect(valuesEqual(1, '1')).toBe(true)
})

it('drops unchanged edited rows from draft', () => {
  const rows = [[1, 'Ada', true]]
  const draft: TableDraft = {
    editedRows: {0: {id: 1, name: 'Ada', enabled: true}},
    newRows: [],
    deletedRowIndexes: [],
  }
  expect(compactDraft(columns, rows, draft)).toBeNull()
  expect(hasEffectiveDraftChanges(columns, rows, draft)).toBe(false)
})

it('keeps draft when a column actually changed', () => {
  const rows = [[1, 'Ada', true]]
  const draft: TableDraft = {
    editedRows: {0: {id: 1, name: 'Bob', enabled: true}},
    newRows: [],
    deletedRowIndexes: [],
  }
  expect(hasEffectiveDraftChanges(columns, rows, draft)).toBe(true)
})
