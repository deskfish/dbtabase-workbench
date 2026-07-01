import { createId } from '../../lib/id'
import type { DatabaseObject, QueryResult } from '../../api/types'
import { buildTableSelectSQL } from '../table/tableQuery'
import type { TableDraft, TableFilterRule, TableSort } from '../table/tableViewState'

export type TabStatus = 'idle' | 'running' | 'error'

export type TableTab = {
  id: string
  kind: 'table'
  title: string
  table: DatabaseObject
  result: QueryResult | null
  queryId: string
  status: TabStatus
  message: string
  sql: string
  page: number
  pageSize: number
  filterRules: TableFilterRule[]
  sort: TableSort | null
  showFilter: boolean
  selectedRow: number | null
  draft: TableDraft | null
}

export type QueryTab = {
  id: string
  kind: 'query'
  title: string
  sql: string
  result: QueryResult | null
  queryId: string
  status: TabStatus
  message: string
  resultTab: 'result' | 'history'
}

export type WorkspaceTab = TableTab | QueryTab

export function tableTabId(table: DatabaseObject): string {
  return `table:${table.catalog ?? ''}/${table.schema ?? ''}/${table.name}`
}

export function tableKey(table: DatabaseObject): string {
  return `${table.catalog ?? ''}/${table.schema ?? ''}/${table.name}`
}

export function qualifiedTableName(table: DatabaseObject): string {
  return table.schema ? `${table.schema}.${table.name}` : table.name
}

export function defaultSelectSQL(table: DatabaseObject, driver: 'mysql' | 'postgres' = 'postgres'): string {
  return buildTableSelectSQL(table, driver, {page: 1, pageSize: 200})
}

export function createQueryTab(sql = 'SELECT *\nFROM your_table\nLIMIT 200;', title?: string): QueryTab {
  return {
    id: `query:${createId()}`,
    kind: 'query',
    title: title ?? 'query_01',
    sql,
    result: null,
    queryId: '',
    status: 'idle',
    message: '尚未执行查询',
    resultTab: 'result',
  }
}

export function createTableTab(table: DatabaseObject, driver: 'mysql' | 'postgres' = 'postgres'): TableTab {
  return {
    id: tableTabId(table),
    kind: 'table',
    title: qualifiedTableName(table),
    table,
    result: null,
    queryId: '',
    status: 'idle',
    message: '正在加载…',
    sql: defaultSelectSQL(table, driver),
    page: 1,
    pageSize: 200,
    filterRules: [],
    sort: null,
    showFilter: false,
    selectedRow: null,
    draft: null,
  }
}
