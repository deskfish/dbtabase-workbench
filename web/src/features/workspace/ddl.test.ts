import {expect, it} from 'vitest'
import {buildCreateTableSQL, buildDropDatabaseSQL, buildDropTableSQL, extractDropConfirmationTarget, isValidSqlIdent} from './ddl'

it('validates sql identifiers', () => {
  expect(isValidSqlIdent('users')).toBe(true)
  expect(isValidSqlIdent('1users')).toBe(false)
  expect(isValidSqlIdent('user-name')).toBe(false)
})

it('builds postgres create table with comments and primary key', () => {
  const sql = buildCreateTableSQL('postgres', 'public', 'users', [
    {name: 'id', type: 'bigint', primary: true},
    {name: 'name', type: 'varchar(255)', comment: "用户'名"},
  ])
  expect(sql).toContain('CREATE TABLE public.users')
  expect(sql).toContain('"id" bigint PRIMARY KEY')
  expect(sql).toContain('"name" varchar(255)')
  expect(sql).toContain("COMMENT ON COLUMN public.users.\"name\" IS '用户''名';")
})

it('builds mysql create table with inline comments and composite primary key', () => {
  const sql = buildCreateTableSQL('mysql', 'app', 'users', [
    {name: 'tenant_id', type: 'bigint', primary: true},
    {name: 'id', type: 'bigint', primary: true},
    {name: 'name', type: 'varchar(255)', comment: '用户名'},
  ])
  expect(sql).toContain('CREATE TABLE users')
  expect(sql).toContain('PRIMARY KEY (`tenant_id`, `id`)')
  expect(sql).toContain("`name` varchar(255) COMMENT '用户名'")
})

it('extracts drop confirmation targets compatible with backend classify', () => {
  expect(extractDropConfirmationTarget(buildDropDatabaseSQL('postgres', 'app'))).toBe('app')
  expect(extractDropConfirmationTarget(buildDropTableSQL('postgres', 'public', 'rules'))).toBe('public.rules')
  expect(extractDropConfirmationTarget(buildDropTableSQL('mysql', 'app', 'rules'))).toBe('rules')
  expect(extractDropConfirmationTarget('SELECT 1')).toBeNull()
})
