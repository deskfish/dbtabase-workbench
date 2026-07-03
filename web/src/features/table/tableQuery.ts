import type { DatabaseObject } from '../../api/types'
import { qualifiedTableName } from '../workspace/types'
import type { FilterOperator, TableFilterRule, TableSort } from './tableViewState'

export type { TableFilterRule, TableSort }

export type TableQueryOptions = {
  filterRules?: TableFilterRule[]
  sort?: TableSort | null
  page?: number
  pageSize?: number
}

function quoteIdent(driver: 'mysql' | 'postgres', name: string): string {
  if (driver === 'postgres') return `"${name.replace(/"/g, '""')}"`
  return `\`${name.replace(/`/g, '``')}\``
}

function escapeLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`
}

function buildFilterClause(driver: 'mysql' | 'postgres', rule: Pick<TableFilterRule, 'column' | 'operator' | 'value'>): string {
  const column = quoteIdent(driver, rule.column)
  switch (rule.operator) {
    case 'is_null':
      return `${column} IS NULL`
    case 'is_not_null':
      return `${column} IS NOT NULL`
    case 'like':
      return `${column} LIKE ${escapeLiteral(rule.value || '%')}`
    default:
      return `${column} ${rule.operator} ${escapeLiteral(rule.value)}`
  }
}

export function isFilterRuleReady(rule: TableFilterRule): boolean {
  if (!rule.enabled || !rule.column) return false
  if (rule.operator === 'is_null' || rule.operator === 'is_not_null') return true
  return rule.value.trim().length > 0
}

export function buildWhereClause(driver: 'mysql' | 'postgres', rules: TableFilterRule[]): string {
  const active = rules.filter(isFilterRuleReady)
  if (active.length === 0) return ''
  let sql = buildFilterClause(driver, active[0])
  for (let index = 1; index < active.length; index += 1) {
    const join = active[index - 1].join.toUpperCase()
    sql += `\n  ${join} ${buildFilterClause(driver, active[index])}`
  }
  return sql
}

export function buildTableSelectSQL(table: DatabaseObject, driver: 'mysql' | 'postgres', options: TableQueryOptions = {}): string {
  const qualified = qualifiedTableName(table)
  const sort = options.sort ?? null
  const page = Math.max(1, options.page ?? 1)
  const pageSize = options.pageSize ?? 200
  const offset = (page - 1) * Math.max(1, pageSize)
  const where = buildWhereClause(driver, options.filterRules ?? [])

  let sql = `SELECT *\nFROM ${qualified}`
  if (where) sql += `\nWHERE ${where}`
  if (sort) sql += `\nORDER BY ${quoteIdent(driver, sort.column)} ${sort.direction.toUpperCase()}`
  if (pageSize > 0) {
    if (driver === 'mysql') {
      sql += `\nLIMIT ${offset}, ${pageSize}`
    } else {
      sql += `\nLIMIT ${pageSize} OFFSET ${offset}`
    }
  }
  return `${sql};`
}
