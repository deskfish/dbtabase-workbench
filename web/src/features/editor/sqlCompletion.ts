import type { DatabaseObject } from '../../api/types'

export type SqlCompletionContext = {
  driver: 'mysql' | 'postgres'
  activeDatabase: string
  defaultSchema: string
  objects: DatabaseObject[]
}

export type SqlCompletionSuggestion = {
  label: string
  insertText: string
  detail?: string
  kind: 'table' | 'column'
}

type TableCatalogItem = {
  schema: string
  name: string
  qualified: string
  columns: {name: string; dataType?: string}[]
}

type ParsedPrefix = {
  target: 'table' | 'column'
  word: string
  tableName?: string
}

function defaultSchema(ctx: SqlCompletionContext): string {
  return ctx.defaultSchema || ctx.activeDatabase || (ctx.driver === 'postgres' ? 'public' : '')
}

export function inferCompletionTarget(textBeforeCursor: string): 'table' | 'column' {
  const tail = textBeforeCursor.replace(/[`"']/g, '')
  if (/\b(?:FROM|JOIN|UPDATE|INTO|TABLE)\s+[\w.]*$/i.test(tail)) return 'table'
  return 'column'
}

export function parseCompletionPrefix(textBeforeCursor: string): ParsedPrefix {
  const lineTail = textBeforeCursor.split('\n').pop() ?? ''
  const tableDot = lineTail.match(/([\w]+)\.([\w`]*)$/)
  if (tableDot) {
    return {target: 'column', tableName: tableDot[1], word: tableDot[2]}
  }
  const wordMatch = lineTail.match(/([\w.]*)$/)
  const word = wordMatch?.[1] ?? ''
  return {target: inferCompletionTarget(textBeforeCursor), word}
}

export function extractTablesFromSql(sql: string, schemaFallback: string): Array<{schema: string; name: string}> {
  const found: Array<{schema: string; name: string}> = []
  const seen = new Set<string>()
  const add = (schema: string, name: string) => {
    const normalizedSchema = schema || schemaFallback
    const key = `${normalizedSchema.toLowerCase()}\0${name.toLowerCase()}`
    if (!name || seen.has(key)) return
    seen.add(key)
    found.push({schema: normalizedSchema, name})
  }
  const parseRef = (raw: string) => {
    const cleaned = raw.replace(/^[`"']|[`"']$/g, '').trim()
    if (!cleaned || /^(INNER|LEFT|RIGHT|FULL|CROSS|ON|AS)$/i.test(cleaned)) return
    if (cleaned.includes('.')) {
      const [schema, name] = cleaned.split('.', 2)
      add(schema, name)
      return
    }
    add(schemaFallback, cleaned)
  }

  const fromMatch = sql.match(/\bFROM\b([\s\S]*?)(?:\bWHERE\b|\bGROUP\b|\bORDER\b|\bLIMIT\b|\bHAVING\b|;|$)/i)
  if (fromMatch) {
    for (const segment of fromMatch[1].split(',')) {
      const token = segment.trim().replace(/^\b(?:INNER|LEFT|RIGHT|FULL|CROSS)?\s*JOIN\b/i, '').split(/\s+/)[0]
      if (token) parseRef(token)
    }
  }

  const joinPattern = /\b(?:INNER|LEFT|RIGHT|FULL|CROSS)?\s*JOIN\s+([`"']?)([\w.]+)\1/gi
  let match: RegExpExecArray | null
  while ((match = joinPattern.exec(sql)) !== null) {
    parseRef(match[2])
  }

  const updatePattern = /\bUPDATE\s+([`"']?)([\w.]+)\1/gi
  while ((match = updatePattern.exec(sql)) !== null) {
    parseRef(match[2])
  }

  const intoPattern = /\bINTO\s+([`"']?)([\w.]+)\1/gi
  while ((match = intoPattern.exec(sql)) !== null) {
    parseRef(match[2])
  }

  return found
}

export function buildTableCatalog(ctx: SqlCompletionContext): TableCatalogItem[] {
  const fallback = defaultSchema(ctx)
  const tables = ctx.objects.filter((item) => item.kind === 'table')
  const columns = ctx.objects.filter((item) => item.kind === 'column')
  return tables.map((table) => {
    const schema = table.schema || fallback
    return {
      schema,
      name: table.name,
      qualified: `${schema}.${table.name}`,
      columns: columns
        .filter((column) => column.parent === table.name && (column.schema || fallback) === schema)
        .map((column) => ({name: column.name, dataType: column.dataType})),
    }
  })
}

function matchesFilter(value: string, filter: string): boolean {
  if (!filter) return true
  return value.toLowerCase().includes(filter.toLowerCase())
}

function findTable(catalog: TableCatalogItem[], schema: string, name: string): TableCatalogItem | undefined {
  const exact = catalog.find((item) => item.name.toLowerCase() === name.toLowerCase() && item.schema.toLowerCase() === schema.toLowerCase())
  if (exact) return exact
  return catalog.find((item) => item.name.toLowerCase() === name.toLowerCase())
}

function suggestTables(catalog: TableCatalogItem[], filter: string): SqlCompletionSuggestion[] {
  return catalog
    .filter((table) => matchesFilter(table.name, filter) || matchesFilter(table.qualified, filter))
    .map((table) => ({
      label: table.qualified,
      insertText: table.qualified,
      detail: '表',
      kind: 'table' as const,
    }))
}

function suggestColumnsForTables(catalog: TableCatalogItem[], tables: TableCatalogItem[], filter: string, qualify: boolean): SqlCompletionSuggestion[] {
  const suggestions: SqlCompletionSuggestion[] = []
  for (const table of tables) {
    for (const column of table.columns) {
      const shortLabel = column.name
      const qualifiedLabel = `${table.name}.${column.name}`
      const label = qualify ? qualifiedLabel : shortLabel
      if (!matchesFilter(shortLabel, filter) && !matchesFilter(qualifiedLabel, filter) && !matchesFilter(table.qualified, filter)) continue
      suggestions.push({
        label,
        insertText: qualify ? qualifiedLabel : shortLabel,
        detail: column.dataType ? `${table.qualified} · ${column.dataType}` : table.qualified,
        kind: 'column',
      })
    }
  }
  return suggestions
}

export function suggestSqlCompletions(ctx: SqlCompletionContext, sql: string, prefix: ParsedPrefix): SqlCompletionSuggestion[] {
  const catalog = buildTableCatalog(ctx)
  if (catalog.length === 0) return []

  const filter = prefix.word
  if (prefix.target === 'table') {
    return suggestTables(catalog, filter)
  }

  if (prefix.tableName) {
    const table = findTable(catalog, defaultSchema(ctx), prefix.tableName)
      ?? catalog.find((item) => item.name.toLowerCase() === prefix.tableName!.toLowerCase())
    if (table) {
      return suggestColumnsForTables(catalog, [table], filter, false)
    }
    return suggestTables(catalog, prefix.tableName)
  }

  const referenced = extractTablesFromSql(sql, defaultSchema(ctx))
  const resolved = referenced
    .map((ref) => findTable(catalog, ref.schema, ref.name))
    .filter((table): table is TableCatalogItem => Boolean(table))

  if (resolved.length > 0) {
    return suggestColumnsForTables(catalog, resolved, filter, resolved.length > 1)
  }

  if (referenced.length > 0) {
    return suggestTables(catalog, '')
  }

  const columnSuggestions: SqlCompletionSuggestion[] = []
  for (const table of catalog) {
    for (const column of table.columns) {
      const label = `${table.qualified}.${column.name}`
      if (!matchesFilter(column.name, filter) && !matchesFilter(label, filter)) continue
      columnSuggestions.push({
        label,
        insertText: column.name,
        detail: column.dataType ?? '字段',
        kind: 'column',
      })
    }
  }
  if (columnSuggestions.length > 0) return columnSuggestions

  return suggestTables(catalog, filter)
}

export function registerSqlCompletionProvider(
  monaco: typeof import('monaco-editor/esm/vs/editor/editor.api.js'),
  getContext: () => SqlCompletionContext | null,
): {dispose: () => void} {
  return monaco.languages.registerCompletionItemProvider('sql', {
    triggerCharacters: ['.', ' ', ','],
    provideCompletionItems(model, position) {
      const ctx = getContext()
      if (!ctx?.objects.length) return {suggestions: []}

      const sql = model.getValue()
      const textBefore = model.getValueInRange({
        startLineNumber: 1,
        startColumn: 1,
        endLineNumber: position.lineNumber,
        endColumn: position.column,
      })
      const prefix = parseCompletionPrefix(textBefore)
      const word = model.getWordUntilPosition(position)
      const range = {
        startLineNumber: position.lineNumber,
        startColumn: prefix.tableName ? position.column - prefix.word.length : word.startColumn,
        endLineNumber: position.lineNumber,
        endColumn: position.column,
      }

      const suggestions = suggestSqlCompletions(ctx, sql, prefix).map((item) => ({
        label: item.label,
        kind: item.kind === 'table' ? monaco.languages.CompletionItemKind.Class : monaco.languages.CompletionItemKind.Field,
        insertText: item.insertText,
        detail: item.detail,
        range,
        sortText: item.label.toLowerCase(),
      }))

      return {suggestions}
    },
  })
}
