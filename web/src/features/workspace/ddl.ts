/** 校验 SQL 标识符（库名、表名、字段名） */
export function isValidSqlIdent(name: string): boolean {
  return /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)
}

/** 新建表字段草稿 */
export type CreateTableColumn = {
  name: string
  type: string
  comment?: string
  primary?: boolean
}

function quoteIdent(driver: 'mysql' | 'postgres', name: string): string {
  if (driver === 'postgres') return `"${name.replace(/"/g, '""')}"`
  return `\`${name.replace(/`/g, '``')}\``
}

function identRef(driver: 'mysql' | 'postgres', name: string): string {
  return isValidSqlIdent(name) ? name : quoteIdent(driver, name)
}

function sqlStringLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`
}

function buildColumnDef(driver: 'mysql' | 'postgres', column: CreateTableColumn, inlinePrimary = false): string {
  let def = `${quoteIdent(driver, column.name)} ${column.type}`
  if (inlinePrimary && column.primary) def += ' PRIMARY KEY'
  const comment = column.comment?.trim()
  if (driver === 'mysql' && comment && !/[;\x00]/.test(comment)) {
    def += ` COMMENT ${sqlStringLiteral(comment)}`
  }
  return def
}

/** 生成 CREATE DATABASE 语句 */
export function buildCreateDatabaseSQL(driver: 'mysql' | 'postgres', name: string): string {
  return `CREATE DATABASE ${identRef(driver, name)};`
}

/** 生成 CREATE TABLE 语句 */
export function buildCreateTableSQL(
  driver: 'mysql' | 'postgres',
  schema: string,
  name: string,
  columns: CreateTableColumn[] = [{name: 'id', type: driver === 'mysql' ? 'bigint' : 'bigint', primary: true}],
): string {
  const tableRef = driver === 'postgres'
    ? `${identRef(driver, schema)}.${identRef(driver, name)}`
    : identRef(driver, name)
  const pkColumns = columns.filter((column) => column.primary).map((column) => quoteIdent(driver, column.name))
  const defs = columns.map((column) => buildColumnDef(driver, column, pkColumns.length === 1))
  if (pkColumns.length > 1) defs.push(`PRIMARY KEY (${pkColumns.join(', ')})`)
  const statements = [`CREATE TABLE ${tableRef} (\n  ${defs.join(',\n  ')}\n);`]
  if (driver === 'postgres') {
    for (const column of columns) {
      const comment = column.comment?.trim()
      if (comment) {
        statements.push(`COMMENT ON COLUMN ${tableRef}.${quoteIdent(driver, column.name)} IS ${sqlStringLiteral(comment)};`)
      }
    }
  }
  return statements.join('\n')
}

/** 生成 DROP DATABASE 语句 */
export function buildDropDatabaseSQL(driver: 'mysql' | 'postgres', name: string): string {
  return `DROP DATABASE ${identRef(driver, name)};`
}

/** 生成 DROP TABLE 语句 */
export function buildDropTableSQL(driver: 'mysql' | 'postgres', schema: string, name: string): string {
  if (driver === 'postgres') {
    return `DROP TABLE ${identRef(driver, schema)}.${identRef(driver, name)};`
  }
  return `DROP TABLE ${identRef(driver, name)};`
}

type SqlToken = {text: string; depth: number}

function tokenizeSql(sql: string): SqlToken[] {
  const result: SqlToken[] = []
  let depth = 0
  for (let i = 0; i < sql.length;) {
    const ch = sql[i]
    if (/\s/.test(ch)) {
      i += 1
      continue
    }
    if (ch === '-' && sql[i + 1] === '-') {
      i += 2
      while (i < sql.length && sql[i] !== '\n') i += 1
      continue
    }
    if (ch === '/' && sql[i + 1] === '*') {
      i += 2
      while (i + 1 < sql.length && !(sql[i] === '*' && sql[i + 1] === '/')) i += 1
      if (i + 1 < sql.length) i += 2
      continue
    }
    if (ch === '\'' || ch === '"' || ch === '`') {
      const quote = ch
      i += 1
      let text = quote
      while (i < sql.length) {
        if (sql[i] === quote) {
          text += quote
          if (i + 1 < sql.length && sql[i + 1] === quote) {
            text += quote
            i += 2
            continue
          }
          i += 1
          break
        }
        if (sql[i] === '\\' && i + 1 < sql.length) {
          text += sql.slice(i, i + 2)
          i += 2
          continue
        }
        text += sql[i]
        i += 1
      }
      result.push({text, depth})
      continue
    }
    if (ch === '(') {
      depth += 1
      i += 1
      continue
    }
    if (ch === ')') {
      if (depth > 0) depth -= 1
      i += 1
      continue
    }
    const start = i
    while (i < sql.length && !/\s/.test(sql[i]) && !'(),;\'"`'.includes(sql[i])) i += 1
    if (i > start) result.push({text: sql.slice(start, i), depth})
    else i += 1
  }
  return result
}

/** 提取 DROP/TRUNCATE 的确认目标，需与后端 query.Classify 一致 */
export function extractDropConfirmationTarget(sql: string): string | null {
  const normalized = sql.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/--.*$/gm, ' ').trim()
  const tokens = tokenizeSql(normalized)
  if (!tokens.length) return null
  if (!/^(DROP|TRUNCATE)$/i.test(tokens[0].text)) return null
  for (const item of tokens.slice(1)) {
    const upper = item.text.toUpperCase()
    if (item.depth === 0 && upper !== 'TABLE' && upper !== 'DATABASE' && upper !== 'SCHEMA' && upper !== 'VIEW' && upper !== 'IF' && upper !== 'EXISTS') {
      return item.text
    }
  }
  return null
}

/** 分页「所有」对应的 pageSize 值 */
export const PAGE_SIZE_ALL = 0
