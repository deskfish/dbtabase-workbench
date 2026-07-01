import { buildTableSelectSQL } from '../table/tableQuery'
import {
  createTableTab,
  qualifiedTableName,
  tableTabId,
  type TableTab,
  type WorkspaceTab,
} from './types'
import type { DatabaseObject } from '../../api/types'

export type TableReloadOptions = {
  table?: DatabaseObject
  overrides?: Partial<Pick<TableTab, 'page' | 'pageSize' | 'filterRules' | 'sort' | 'showFilter' | 'selectedRow' | 'draft'>>
  resetDraft?: boolean
}

export function prepareTableTabReload(
  current: WorkspaceTab[],
  id: string,
  driver: 'mysql' | 'postgres',
  options: TableReloadOptions = {},
): {tabs: WorkspaceTab[]; snapshot: TableTab} | null {
  const {table, overrides = {}, resetDraft = false} = options
  let base = current.find((tab) => tab.id === id && tab.kind === 'table') as TableTab | undefined
  let nextTabs = current
  if (!base) {
    if (!table) return null
    base = createTableTab(table, driver)
    nextTabs = [...current, base]
  }
  const snapshot: TableTab = {
    ...base,
    ...overrides,
    draft: resetDraft ? null : (overrides.draft ?? base.draft),
    status: 'running',
    message: `正在加载 ${base.title}…`,
    result: base.result?.columns?.length
      ? {...base.result, rows: [], queryId: '', nextCursor: undefined, truncated: false}
      : null,
    queryId: '',
    sql: '',
  }
  snapshot.sql = buildTableSelectSQL(snapshot.table, driver, {
    filterRules: snapshot.filterRules,
    sort: snapshot.sort,
    page: snapshot.page,
    pageSize: snapshot.pageSize,
  })
  return {
    tabs: nextTabs.map((tab) => tab.id === id ? snapshot : tab),
    snapshot,
  }
}

export function tableObject(schema: string | undefined, name: string): DatabaseObject {
  return {kind: 'table', schema, name}
}

export function tableIdFor(schema: string | undefined, name: string): string {
  return tableTabId(tableObject(schema, name))
}

export function tableTitle(schema: string | undefined, name: string): string {
  return qualifiedTableName(tableObject(schema, name))
}
