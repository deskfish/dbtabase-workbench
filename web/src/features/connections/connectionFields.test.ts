import { expect, it } from 'vitest'
import { driverFormSpec, normalizeConnectionInput, validateConnectionInput } from './connectionFields'
import type { ConnectionInput } from '../../api/types'

const base = (driver: ConnectionInput['driver'], extra: Partial<ConnectionInput> = {}): ConnectionInput => ({
  driver,
  host: '10.0.0.1',
  port: 6379,
  database: '',
  user: '',
  password: '',
  tlsMode: 'disabled',
  ...extra,
})

it('requires mysql database and credentials', () => {
  expect(validateConnectionInput(base('mysql', {port: 3306, user: 'u', password: 'p'}))).toBe('请输入数据库')
  expect(validateConnectionInput(base('mysql', {port: 3306, database: 'app', user: 'u', password: 'p'}))).toBeNull()
})

it('allows postgres without database name', () => {
  expect(validateConnectionInput(base('postgres', {port: 5432, user: 'u', password: 'p'}))).toBeNull()
  expect(normalizeConnectionInput(base('postgres', {port: 5432, user: 'u', password: 'p'})).database).toBe('postgres')
})

it('allows redis without password or username', () => {
  expect(validateConnectionInput(base('redis'))).toBeNull()
  expect(driverFormSpec('redis').password.required).toBe(false)
})

it('validates redis db index', () => {
  expect(validateConnectionInput(base('redis', {database: '16'}))).toBe('Redis DB 索引必须是 0–15 的整数')
  expect(validateConnectionInput(base('redis', {database: '3'}))).toBeNull()
})

it('requires mongo password when username is set', () => {
  expect(validateConnectionInput(base('mongodb', {port: 27017, user: 'root'}))).toBe('填写 MongoDB 用户名时必须提供密码')
  expect(validateConnectionInput(base('mongodb', {port: 27017, user: 'root', password: 'root'}))).toBeNull()
})
