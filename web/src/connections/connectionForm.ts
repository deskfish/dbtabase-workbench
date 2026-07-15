import type { TeamSummary } from '../settings/client'
import type { ConnectionDriver, ConnectionKind, ConnectionScope, SaveInput } from './types'

export type ConnectionFormValue = {
  name: string
  kind: ConnectionKind
  driver: ConnectionDriver
  scope: ConnectionScope
  teamId: string
  host: string
  port: string
  database: string
  username: string
  password: string
  privateKey: string
  passphrase: string
}

export class ConnectionFormError extends Error {
  constructor(public fields: Record<string, string>) {
    super('连接表单校验失败')
    this.name = 'ConnectionFormError'
  }
}

const databaseDrivers = new Set<ConnectionDriver>(['postgres', 'mysql', 'mongodb', 'redis'])
const defaultPorts: Record<ConnectionDriver, number> = {
  postgres: 5432,
  mysql: 3306,
  mongodb: 27017,
  redis: 6379,
  ssh: 22,
}

export function defaultPort(driver: ConnectionDriver): string {
  return String(defaultPorts[driver])
}

export function defaultDriver(kind: ConnectionKind): ConnectionDriver {
  return kind === 'ssh' ? 'ssh' : 'postgres'
}

export function isValidKindDriver(kind: ConnectionKind, driver: ConnectionDriver): boolean {
  return kind === 'ssh' ? driver === 'ssh' : databaseDrivers.has(driver)
}

type SaveOptions = {
  existingSecret?: boolean
}

export function toSaveInput(value: ConnectionFormValue, teams: TeamSummary[], options: SaveOptions = {}): SaveInput {
  const fields: Record<string, string> = {}
  const name = value.name.trim()
  const host = value.host.trim()
  const database = value.database.trim()
  const username = value.username.trim()
  const password = value.password.trim()
  const privateKey = value.privateKey.trim()
  const passphrase = value.passphrase.trim()

  if (!name) fields.name = '请输入连接名称'
  if (!host) fields.host = '请输入主机名'
  if (!isValidKindDriver(value.kind, value.driver)) fields.driver = '类型和驱动不匹配'
  if (value.scope === 'team' && !teams.some((team) => team.id === value.teamId && team.role === 'admin')) fields.teamId = '请选择你管理的团队'
  if (value.kind === 'ssh' && passphrase && !privateKey) fields.passphrase = '私钥口令需要配合私钥使用'
  if (value.kind === 'ssh' && !password && !privateKey && !options.existingSecret) fields.credentials = '请输入登录密码或私钥'

  const rawPort = value.port.trim() || (value.kind === 'ssh' ? '22' : defaultPort(value.driver))
  const port = Number(rawPort)
  if (!Number.isInteger(port) || port < 1 || port > 65535) fields.port = '端口必须在 1 到 65535 之间'

  if (Object.keys(fields).length > 0) throw new ConnectionFormError(fields)

  const connection: SaveInput['connection'] = {
    name,
    kind: value.kind,
    driver: value.driver,
    scope: value.scope,
    endpoint: {host, port},
    config: value.kind === 'database' && database ? {database} : {},
  }
  if (value.scope === 'team') connection.teamId = value.teamId

  if (value.kind === 'database' && password) {
    return {connection, secret: {username, password}}
  }
  if (value.kind === 'ssh' && (password || privateKey)) {
    return {
      connection,
      secret: {
        username,
        ...(password ? {password} : {}),
        ...(privateKey ? {privateKey, ...(passphrase ? {passphrase} : {})} : {}),
      },
    }
  }
  return {connection}
}
