import { expect, it } from 'vitest'
import {
  buildTableCatalog,
  extractTablesFromSql,
  inferCompletionTarget,
  parseCompletionPrefix,
  suggestSqlCompletions,
  type SqlCompletionContext,
} from './sqlCompletion'

const ctx: SqlCompletionContext = {
  driver: 'postgres',
  activeDatabase: 'channelHub',
  defaultSchema: 'public',
  objects: [
    {kind: 'table', schema: 'public', name: 'enterprise_contact'},
    {kind: 'column', schema: 'public', parent: 'enterprise_contact', name: 'id', dataType: 'bigint'},
    {kind: 'column', schema: 'public', parent: 'enterprise_contact', name: 'name', dataType: 'varchar'},
    {kind: 'table', schema: 'public', name: 'channel'},
    {kind: 'column', schema: 'public', parent: 'channel', name: 'id', dataType: 'bigint'},
    {kind: 'column', schema: 'public', parent: 'channel', name: 'code', dataType: 'varchar'},
  ],
}

it('extracts referenced tables from FROM and JOIN clauses', () => {
  expect(extractTablesFromSql('SELECT * FROM public.enterprise_contact JOIN channel ON channel.id = enterprise_contact.channel_id', 'public')).toEqual([
    {schema: 'public', name: 'enterprise_contact'},
    {schema: 'public', name: 'channel'},
  ])
})

it('detects table completion after FROM', () => {
  expect(inferCompletionTarget('SELECT *\nFROM enter')).toBe('table')
  expect(parseCompletionPrefix('SELECT id FROM ')).toEqual({target: 'table', word: ''})
})

it('suggests qualified table names when completing tables', () => {
  const items = suggestSqlCompletions(ctx, 'SELECT * FROM ent', {target: 'table', word: 'ent'})
  expect(items.map((item) => item.label)).toEqual(['public.enterprise_contact'])
})

it('suggests columns from referenced table in SELECT list', () => {
  const sql = 'SELECT na FROM public.enterprise_contact'
  const items = suggestSqlCompletions(ctx, sql, {target: 'column', word: 'na'})
  expect(items.map((item) => item.label)).toEqual(['name'])
})

it('suggests table-qualified columns when multiple tables are referenced', () => {
  const sql = 'SELECT id FROM public.enterprise_contact, public.channel WHERE '
  const items = suggestSqlCompletions(ctx, sql, {target: 'column', word: 'id'})
  expect(items.map((item) => item.label)).toEqual(['enterprise_contact.id', 'channel.id'])
})

it('suggests columns after table dot prefix', () => {
  const items = suggestSqlCompletions(ctx, 'SELECT enterprise_contact.', parseCompletionPrefix('SELECT enterprise_contact.'))
  expect(items.map((item) => item.label)).toEqual(['id', 'name'])
})

it('falls back to qualified tables when referenced table does not exist', () => {
  const items = suggestSqlCompletions(ctx, 'SELECT id FROM your_table', {target: 'column', word: 'id'})
  expect(items.every((item) => item.kind === 'table')).toBe(true)
  expect(items.map((item) => item.label)).toEqual(['public.enterprise_contact', 'public.channel'])
})

it('builds mysql catalog with schema-qualified table names', () => {
  const mysqlCtx: SqlCompletionContext = {
    driver: 'mysql',
    activeDatabase: 'fim',
    defaultSchema: 'fim',
    objects: [
      {kind: 'table', schema: 'fim', name: 't_im_message'},
      {kind: 'column', schema: 'fim', parent: 't_im_message', name: 'id', dataType: 'bigint'},
    ],
  }
  expect(buildTableCatalog(mysqlCtx)[0]?.qualified).toBe('fim.t_im_message')
})
