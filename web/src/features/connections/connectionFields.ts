import type { ConnectionInput } from '../../api/types'
import type { DriverId } from '../../api/driver'
import { defaultPort } from '../../api/driver'

export type FieldSpec = {
  label: string
  placeholder: string
  required: boolean
  visible: boolean
}

export type DriverFormSpec = {
  database: FieldSpec
  user: FieldSpec
  password: FieldSpec
  tlsOptions: {value: string; label: string}[]
}

const TLS_MYSQL = [
  {value: 'disabled', label: '关闭'},
  {value: 'preferred', label: '优先'},
  {value: 'required', label: '必须'},
] as const

const TLS_PG_MONGO = [
  {value: 'disable', label: '关闭'},
  {value: 'prefer', label: '优先'},
  {value: 'require', label: '必须'},
  {value: 'verify-full', label: '完整验证'},
] as const

const TLS_REDIS = [
  {value: 'disabled', label: '关闭'},
  {value: 'required', label: '必须'},
] as const

export function driverFormSpec(driver: DriverId): DriverFormSpec {
  switch (driver) {
    case 'mysql':
      return {
        database: {label: '数据库', placeholder: '数据库名', required: true, visible: true},
        user: {label: '用户名', placeholder: '', required: true, visible: true},
        password: {label: '数据库密码', placeholder: '', required: true, visible: true},
        tlsOptions: [...TLS_MYSQL],
      }
    case 'postgres':
      return {
        database: {label: '数据库', placeholder: '留空默认 postgres，连接后可切换', required: false, visible: true},
        user: {label: '用户名', placeholder: '', required: true, visible: true},
        password: {label: '数据库密码', placeholder: '', required: true, visible: true},
        tlsOptions: [...TLS_PG_MONGO],
      }
    case 'mongodb':
      return {
        database: {label: '默认库', placeholder: '留空默认 admin，连接后可切换', required: false, visible: true},
        user: {label: '用户名', placeholder: '无认证可留空', required: false, visible: true},
        password: {label: '数据库密码', placeholder: '无认证可留空', required: false, visible: true},
        tlsOptions: [...TLS_PG_MONGO],
      }
    case 'redis':
      return {
        database: {label: 'DB 索引', placeholder: '0–15，默认 0', required: false, visible: true},
        user: {label: '用户名', placeholder: '可选（Redis ACL）', required: false, visible: true},
        password: {label: '密码', placeholder: '可选', required: false, visible: true},
        tlsOptions: [...TLS_REDIS],
      }
  }
}

export function defaultTLSMode(driver: DriverId): string {
  switch (driver) {
    case 'mysql':
    case 'redis':
      return 'disabled'
    case 'postgres':
    case 'mongodb':
      return 'prefer'
  }
}

export function normalizeConnectionInput(input: ConnectionInput): ConnectionInput {
  const trimmed = {
    ...input,
    host: input.host.trim(),
    database: input.database.trim(),
    user: input.user.trim(),
    password: input.password,
  }
  if (trimmed.driver === 'postgres' && !trimmed.database) {
    return {...trimmed, database: 'postgres'}
  }
  if (trimmed.driver === 'mongodb' && !trimmed.database) {
    return {...trimmed, database: 'admin'}
  }
  if (trimmed.driver === 'redis' && !trimmed.database) {
    return {...trimmed, database: '0'}
  }
  return trimmed
}

export function validateConnectionInput(input: ConnectionInput): string | null {
  const spec = driverFormSpec(input.driver)
  if (!input.host.trim()) return '请输入主机地址'
  if (!input.port || input.port < 1 || input.port > 65535) return '请输入有效端口'

  if (spec.database.required && !input.database.trim()) return `请输入${spec.database.label}`
  if (input.driver === 'redis' && input.database.trim()) {
    const index = Number(input.database.trim())
    if (!Number.isInteger(index) || index < 0 || index > 15) return 'Redis DB 索引必须是 0–15 的整数'
  }

  if (spec.user.required && !input.user.trim()) return '请输入用户名'
  if (spec.password.required && !input.password) return '请输入数据库密码'

  if (input.driver === 'mongodb' && input.user.trim() && !input.password) {
    return '填写 MongoDB 用户名时必须提供密码'
  }

  return null
}

export function connectionNeedsStoredPassword(driver: DriverId): boolean {
  return driver === 'mysql' || driver === 'postgres'
}

export function driverDefaults(driver: DriverId): Pick<ConnectionInput, 'driver' | 'port' | 'tlsMode'> {
  return {driver, port: defaultPort(driver), tlsMode: defaultTLSMode(driver)}
}
