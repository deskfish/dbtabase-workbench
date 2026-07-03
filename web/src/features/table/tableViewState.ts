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
  {value: '=', label: '='},
  {value: '!=', label: '!='},
  {value: '>', label: '>'},
  {value: '<', label: '<'},
  {value: '>=', label: '>='},
  {value: '<=', label: '<='},
  {value: 'like', label: 'LIKE'},
  {value: 'is_null', label: 'IS NULL'},
  {value: 'is_not_null', label: 'IS NOT NULL'},
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
