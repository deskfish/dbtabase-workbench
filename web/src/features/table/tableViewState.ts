import { createId } from '../../lib/id'

export type FilterOperator = '=' | '!=' | '>' | '<' | '>=' | '<=' | 'like' | 'is_null' | 'is_not_null'
export type FilterJoin = 'and' | 'or'

export type TableFilterRule = {
  id: string
  enabled: boolean
  column: string
  operator: FilterOperator
  value: string
  join: FilterJoin
}

export type TableSort = {
  column: string
  direction: 'asc' | 'desc'
}

export type TableDraft = {
  editedRows: Record<number, Record<string, unknown>>
  newRows: Array<Record<string, unknown>>
  deletedRowIndexes: number[]
}

export const FILTER_OPERATORS: Array<{value: FilterOperator; label: string}> = [
  {value: '=', label: '等于'},
  {value: '!=', label: '不等于'},
  {value: '>', label: '大于'},
  {value: '<', label: '小于'},
  {value: '>=', label: '大于等于'},
  {value: '<=', label: '小于等于'},
  {value: 'like', label: '包含'},
  {value: 'is_null', label: '为空'},
  {value: 'is_not_null', label: '不为空'},
]

export function createEmptyFilterRule(column = '', join: FilterJoin = 'and'): TableFilterRule {
  return {id: createId(), enabled: true, column, operator: '=', value: '', join}
}

export function emptyDraft(): TableDraft {
  return {editedRows: {}, newRows: [], deletedRowIndexes: []}
}

export function hasDraftChanges(draft: TableDraft | null): boolean {
  if (!draft) return false
  return draft.deletedRowIndexes.length > 0 || draft.newRows.length > 0 || Object.keys(draft.editedRows).length > 0
}

export function normalizeFilterRules(rules: TableFilterRule[], defaultColumn: string): TableFilterRule[] {
  if (rules.length > 0) return rules
  return [createEmptyFilterRule(defaultColumn)]
}
