import type {TableDraft} from './tableViewState'

type Column = {name: string; dataType?: string}

function isNumericType(dataType?: string): boolean {
  if (!dataType) return false
  const type = dataType.toLowerCase()
  return type.includes('int') || type.includes('numeric') || type.includes('decimal') || type.includes('double') || type.includes('real') || type.includes('serial')
}

function isBooleanType(dataType?: string): boolean {
  return dataType?.toLowerCase().includes('bool') ?? false
}

export function valuesEqual(left: unknown, right: unknown): boolean {
  if (left === right) return true
  if (left == null && right == null) return true
  return String(left) === String(right)
}

export function coerceCellValue(raw: unknown, dataType?: string): unknown {
  if (raw == null) return null
  if (typeof raw !== 'string') return raw
  const text = raw.trim()
  if (text === '') return null
  if (isBooleanType(dataType)) {
    if (text.toLowerCase() === 'true') return true
    if (text.toLowerCase() === 'false') return false
  }
  if (isNumericType(dataType) && /^-?\d+(\.\d+)?$/.test(text)) {
    return text.includes('.') ? Number(text) : Number.parseInt(text, 10)
  }
  return raw
}

export function rowToRecord(columns: Column[], row: unknown[]): Record<string, unknown> {
  return Object.fromEntries(columns.map((column, index) => [column.name, row[index]]))
}

export function buildRowKey(columns: Column[], row: unknown[], uniqueKey: string[]): Record<string, unknown> {
  const record = rowToRecord(columns, row)
  return Object.fromEntries(uniqueKey.map((name) => [name, record[name]]))
}

export function buildRowUpdate(
  columns: Column[],
  originalRow: unknown[],
  editedRow: Record<string, unknown>,
  uniqueKey: string[],
): {key: Record<string, unknown>; values: Record<string, unknown>} | null {
  const key = buildRowKey(columns, originalRow, uniqueKey)
  const values: Record<string, unknown> = {}
  for (const column of columns) {
    if (uniqueKey.includes(column.name)) continue
    const nextValue = coerceCellValue(editedRow[column.name], column.dataType)
    const previousValue = originalRow[columns.findIndex((item) => item.name === column.name)]
    if (!valuesEqual(nextValue, previousValue)) {
      values[column.name] = nextValue
    }
  }
  if (Object.keys(values).length === 0) return null
  return {key, values}
}

export function buildInsertValues(columns: Column[], row: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(columns.map((column) => [column.name, coerceCellValue(row[column.name], column.dataType)]))
}

/** 去掉与原始行完全相同的编辑记录，避免仅选中未改也进入脏状态 */
export function compactDraft(columns: Column[], rows: unknown[][], draft: TableDraft): TableDraft | null {
  const editedRows: Record<number, Record<string, unknown>> = {}
  for (const [indexText, editedRow] of Object.entries(draft.editedRows)) {
    const index = Number(indexText)
    const originalRow = rows[index]
    if (!originalRow) continue
    if (buildRowUpdate(columns, originalRow, editedRow, []) !== null) {
      editedRows[index] = editedRow
    }
  }
  const next: TableDraft = {
    editedRows,
    newRows: draft.newRows,
    deletedRowIndexes: draft.deletedRowIndexes,
  }
  if (next.deletedRowIndexes.length === 0 && next.newRows.length === 0 && Object.keys(editedRows).length === 0) {
    return null
  }
  return next
}

export function hasEffectiveDraftChanges(columns: Column[], rows: unknown[][], draft: TableDraft | null): boolean {
  if (!draft) return false
  return compactDraft(columns, rows, draft) !== null
}
