export type ConnectionKind = 'database' | 'ssh'
export type ConnectionScope = 'personal' | 'team'
export type DatabaseDriver = 'postgres' | 'mysql' | 'mongodb' | 'redis'
export type ConnectionDriver = DatabaseDriver | 'ssh'

export type ConnectionEndpoint = {
  host: string
  port: number
}

export type ConnectionConfig = {
  database?: string
  [key: string]: unknown
}

export type Connection = {
  id: string
  name: string
  kind: ConnectionKind
  driver: ConnectionDriver
  scope: ConnectionScope
  ownerUserId?: string
  teamId?: string
  endpoint: ConnectionEndpoint
  config: ConnectionConfig
  hasSecret: boolean
}

export type Secret = {
  username: string
  password?: string
  privateKey?: string
  passphrase?: string
}

export type SaveInput = {
  connection: Omit<Connection, 'id' | 'ownerUserId' | 'hasSecret'> & {id?: string; ownerUserId?: string; hasSecret?: boolean}
  secret?: Secret
}

export type ConnectionFilters = {
  kind?: '' | ConnectionKind
  scope?: '' | ConnectionScope
}

export type WorkbenchTarget = {
  id: string
  name: string
  driver: DatabaseDriver
  scope: ConnectionScope
  teamId?: string
  host: string
  port: number
  database: string
  hasSecret: boolean
}
