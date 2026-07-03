export type ConnectionInput = {
  driver: 'mysql' | 'postgres' | 'mongodb' | 'redis'
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

export type SchemaColumn = {name:string; type:string; nullable:boolean; default?:string; comment?:string; primary?:boolean}
export type SchemaIndex = {name:string; columns:string[]; unique:boolean}
export type SchemaForeignKey = {name:string; columns:string[]; refSchema:string; refTable:string; refColumns:string[]; onDelete?:string; onUpdate?:string}
export type TableDetail = {table:{schema:string; name:string; columns:SchemaColumn[]; indexes:SchemaIndex[]; foreignKeys:SchemaForeignKey[]}; capabilities:{schemaEdit:boolean;indexEdit:boolean;foreignKeyEdit:boolean;transactionalDDL:boolean}; ddl?:string;estimatedRows?:number;permissions:string[]}
export type SchemaOperation = {kind:string;name?:string;newName?:string;column?:SchemaColumn;index?:SchemaIndex;foreignKey?:SchemaForeignKey}
export type SchemaPreview = {statements:{sql:string;destructive?:boolean}[];risks:{level:string;kind:string;target:string;message:string}[];warnings?:string[];fingerprint:string;token:string;expiresAt:number}

export type MongoFindResult = {
  columns: QueryColumn[]
  rows: unknown[][]
  total?: number
  truncated?: boolean
  durationMs: number
}

export type MongoCollectionDetail = {
  collection: string
  database: string
  estimatedDocs?: number
  fields: {path: string; type: string; occurrence: number; example?: string}[]
  indexes: {name: string; keys: string[]; unique: boolean}[]
  validator?: string
}

export type RedisKeySummary = {key: string; type: string; ttl: number}
export type RedisKeysResult = {keys: RedisKeySummary[]; cursor: number; durationMs: number}
export type RedisKeyDetail = {key: string; type: string; ttl: number; value: unknown; durationMs: number}
export type RedisCommandResult = {results: {command: string; output?: unknown; error?: string}[]; durationMs: number}
