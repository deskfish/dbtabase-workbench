import type { DatabaseObject, QueryResult } from '../../api/types'

export type TableColumn = {name: string; dataType?: string}

/** 优先用查询结果列，其次用对象树元数据，避免筛选无数据或重载时表头消失 */
export function resolveTableColumns(
  table: DatabaseObject,
  result: QueryResult | null,
  objects: DatabaseObject[],
): TableColumn[] {
  const fromResult = (result?.columns ?? []).filter((column) => column.name)
  if (fromResult.length > 0) {
    return fromResult.map((column) => ({name: column.name, dataType: column.databaseType}))
  }
  return objects
    .filter((object) => object.kind === 'column'
      && object.parent === table.name
      && (object.schema ?? '') === (table.schema ?? ''))
    .map((object) => ({name: object.name, dataType: object.dataType}))
}

export function preserveResultColumns(previous: QueryResult | null, next: QueryResult): QueryResult {
  if ((next.columns?.length ?? 0) > 0) return next
  if (!previous?.columns?.length) return next
  return {...next, columns: previous.columns}
}
