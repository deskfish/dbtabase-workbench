export type ConnectionInput = {
  driver: 'mysql' | 'postgres'
  host: string
  port: number
  database: string
  user: string
  password: string
  tlsMode: string
}

export type DatabaseObject = {
  kind: 'table' | 'column' | 'view' | 'index' | 'key'
  catalog?: string
  schema?: string
  name: string
  parent?: string
  dataType?: string
  nullable?: boolean
}

export type QueryRisk = {level:'safe'|'confirm'|'type_target'; kind?:string; target?:string; reason?:string}
export type QueryColumn = {name:string; databaseType?:string}
export type QueryResult = {
  queryId: string
  columns?: QueryColumn[]
  rows?: unknown[][]
  nextCursor?: number
  affectedRows?: number
  durationMs: number
  truncated?: boolean
  status?: 'running'
}

export type MutationInput = {
  schema?: string
  table: string
  values?: Record<string, unknown>
  key?: Record<string, unknown>
  transactionId?: string
}
