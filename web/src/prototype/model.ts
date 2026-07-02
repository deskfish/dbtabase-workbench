export type PrototypeView = 'data' | 'schema' | 'query'

export type ConnectionFixture = {
  id: string
  name: string
  driver: 'PostgreSQL' | 'MySQL'
  host: string
  database: string
  connected?: boolean
  shared?: boolean
}

export type DatabaseFixture = {
  name: string
  selected?: boolean
}

export type TableFixture = {
  schema: string
  name: string
  rows: number
}

export type TeamConnectionFixture = ConnectionFixture & {
  owner: string
  team: string
  syncedAt: string
  copied?: boolean
}

export type DataColumn = {
  key: string
  label: string
  type: string
  width?: number
}

export type DataRow = Record<string, string | number | null>
