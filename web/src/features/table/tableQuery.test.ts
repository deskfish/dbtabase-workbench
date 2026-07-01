import { expect, it } from 'vitest'
import { buildTableSelectSQL, buildWhereClause } from './tableQuery'
import { createEmptyFilterRule } from './tableViewState'

const table = {kind: 'table' as const, schema: 'public', name: 'people'}

it('builds paginated postgres select sql', () => {
  expect(buildTableSelectSQL(table, 'postgres', {page: 2, pageSize: 100})).toBe(
    'SELECT *\nFROM public.people\nLIMIT 100 OFFSET 100;',
  )
})

it('adds filters and sort for mysql', () => {
  expect(buildTableSelectSQL(table, 'mysql', {
    filterRules: [{...createEmptyFilterRule('name'), operator: 'like', value: '%Ada%'}],
    sort: {column: 'id', direction: 'desc'},
    page: 1,
    pageSize: 50,
  })).toBe(
    "SELECT *\nFROM public.people\nWHERE `name` LIKE '%Ada%'\nORDER BY `id` DESC\nLIMIT 0, 50;",
  )
})

it('supports and/or chains between enabled rules', () => {
  const rules = [
    {...createEmptyFilterRule('id'), value: '1', join: 'and' as const},
    {...createEmptyFilterRule('name'), operator: 'like' as const, value: '%Ada%', join: 'or' as const},
    {...createEmptyFilterRule('enabled'), operator: 'is_not_null' as const, value: '', join: 'and' as const},
  ]
  expect(buildWhereClause('postgres', rules)).toBe(
    `"id" = '1'\n  AND "name" LIKE '%Ada%'\n  OR "enabled" IS NOT NULL`,
  )
})

it('ignores disabled or incomplete rules', () => {
  const rules = [
    {...createEmptyFilterRule('id'), enabled: false, value: '9', join: 'and' as const},
    {...createEmptyFilterRule('name'), value: 'Bob', join: 'and' as const},
  ]
  expect(buildWhereClause('postgres', rules)).toBe(`"name" = 'Bob'`)
})
