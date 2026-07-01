import { useMemo, useState } from 'react'
import type { MutationInput } from '../../api/types'
import { ContextMenu, type ContextMenuItem } from '../ui/ContextMenu'
import { emptyDraft, type TableDraft, type TableFilterRule, type TableSort } from './tableViewState'
import { buildInsertValues, buildRowKey, buildRowUpdate, coerceCellValue, compactDraft, hasEffectiveDraftChanges, rowToRecord, valuesEqual } from './tableMutations'
import { isFilterRuleReady } from './tableQuery'
import { TableFilterBuilder } from './TableFilterBuilder'

type Column = {name: string; dataType?: string}

type DisplayRow = {sourceIndex: number; isNew: boolean; values: unknown[]}

type HeaderMenu = {column: Column; x: number; y: number}

export function TableView({
  schema,
  table,
  columns,
  rows,
  uniqueKey,
  sql,
  status,
  message,
  page,
  pageSize,
  filterRules,
  sort,
  showFilter,
  selectedRow,
  draft,
  truncated,
  onSelectRow,
  onPageChange,
  onPageSizeChange,
  onFiltersApply,
  onFiltersClear,
  onSortChange,
  onToggleFilter,
  onRefresh,
  onStop,
  onDraftChange,
  onApply,
  onDiscard,
  onExport,
  onSaveError,
  onMutate,
}: {
  schema?: string
  table: string
  columns: Column[]
  rows: unknown[][]
  uniqueKey: string[]
  sql: string
  status: 'idle' | 'running' | 'error'
  message: string
  page: number
  pageSize: number
  filterRules: TableFilterRule[]
  sort: TableSort | null
  showFilter: boolean
  selectedRow: number | null
  draft: TableDraft | null
  truncated?: boolean
  onSelectRow: (index: number | null) => void
  onPageChange: (page: number) => void
  onPageSizeChange: (size: number) => void
  onFiltersApply: (rules: TableFilterRule[]) => void
  onFiltersClear: () => void
  onSortChange: (sort: TableSort | null) => void
  onToggleFilter: () => void
  onRefresh: () => void
  onStop: () => void
  onDraftChange: (draft: TableDraft | null) => void
  onApply: () => Promise<void>
  onDiscard: () => void
  onExport: () => void
  onSaveError: (message: string) => void
  onMutate: (operation: 'insert' | 'update' | 'delete', input: MutationInput) => Promise<void>
}) {
  const [headerMenu, setHeaderMenu] = useState<HeaderMenu | null>(null)
  const [editingCell, setEditingCell] = useState<{row: number; column: number} | null>(null)

  const editable = uniqueKey.length > 0 && uniqueKey.every((key) => columns.some((column) => column.name === key))
  const draftState = draft ?? emptyDraft()
  const dirty = hasEffectiveDraftChanges(columns, rows, draft)
  const deleted = useMemo(() => new Set(draftState.deletedRowIndexes), [draftState.deletedRowIndexes])

  const displayRows = useMemo(() => {
    const visible: DisplayRow[] = rows
      .map((row, index) => {
        if (deleted.has(index)) return null
        const edits = draftState.editedRows[index]
        if (!edits) return {sourceIndex: index, isNew: false, values: row}
        return {
          sourceIndex: index,
          isNew: false,
          values: columns.map((column, columnIndex) => edits[column.name] !== undefined ? edits[column.name] : row[columnIndex]),
        }
      })
      .filter((item): item is DisplayRow => item !== null)

    for (const newRow of draftState.newRows) {
      visible.push({
        sourceIndex: -1,
        isNew: true,
        values: columns.map((column) => newRow[column.name] ?? null),
      })
    }
    return visible
  }, [columns, deleted, draftState.editedRows, draftState.newRows, rows])

  const headerMenuItems: ContextMenuItem[] = headerMenu
    ? [
      {label: '升序排序', action: () => onSortChange({column: headerMenu.column.name, direction: 'asc'})},
      {label: '降序排序', action: () => onSortChange({column: headerMenu.column.name, direction: 'desc'})},
      {separator: true},
      {label: '移除排序', action: () => onSortChange(null), disabled: !sort || sort.column !== headerMenu.column.name},
    ]
    : []

  function ensureDraft(): TableDraft {
    const next = draft ? {...draft, editedRows: {...draft.editedRows}, newRows: [...draft.newRows], deletedRowIndexes: [...draft.deletedRowIndexes]} : emptyDraft()
    onDraftChange(next)
    return next
  }

  function updateCell(rowIndex: number, columnIndex: number, value: string) {
    const item = displayRows[rowIndex]
    if (!item) return
    const column = columns[columnIndex]
    const coerced = coerceCellValue(value === '' ? null : value, column.dataType)

    const next: TableDraft = draft
      ? {editedRows: {...draft.editedRows}, newRows: [...draft.newRows], deletedRowIndexes: [...draft.deletedRowIndexes]}
      : emptyDraft()

    if (item.isNew) {
      const newIndex = rowIndex - (displayRows.length - next.newRows.length)
      next.newRows[newIndex] = {...next.newRows[newIndex], [column.name]: coerced}
      onDraftChange(compactDraft(columns, rows, next))
      return
    }

    const originalRow = rows[item.sourceIndex]
    const originalValue = coerceCellValue(originalRow[columnIndex], column.dataType)
    if (valuesEqual(coerced, originalValue)) {
      if (!draft?.editedRows[item.sourceIndex]) return
      const current = {...next.editedRows[item.sourceIndex], [column.name]: coerced}
      if (buildRowUpdate(columns, originalRow, current, []) === null) {
        delete next.editedRows[item.sourceIndex]
      } else {
        next.editedRows[item.sourceIndex] = current
      }
      onDraftChange(compactDraft(columns, rows, next))
      return
    }

    const current = next.editedRows[item.sourceIndex] ?? rowToRecord(columns, originalRow)
    next.editedRows[item.sourceIndex] = {...current, [column.name]: coerced}
    onDraftChange(compactDraft(columns, rows, next))
  }

  function addRow() {
    const next = ensureDraft()
    next.newRows.push(Object.fromEntries(columns.map((column) => [column.name, null])))
    onDraftChange(next)
    onSelectRow(displayRows.length)
  }

  function deleteSelectedRow() {
    if (selectedRow === null) return
    const item = displayRows[selectedRow]
    if (!item) return
    const next = ensureDraft()
    if (item.isNew) {
      const newIndex = selectedRow - (displayRows.length - next.newRows.length)
      next.newRows.splice(newIndex, 1)
    } else {
      if (!next.deletedRowIndexes.includes(item.sourceIndex)) next.deletedRowIndexes.push(item.sourceIndex)
      delete next.editedRows[item.sourceIndex]
    }
    onDraftChange(next)
    onSelectRow(null)
  }

  async function applyDraft() {
    if (!editable || !dirty) return
    try {
      for (const index of draftState.deletedRowIndexes) {
        const key = buildRowKey(columns, rows[index], uniqueKey)
        await onMutate('delete', {schema, table, key})
      }
      for (const [indexText, editedRow] of Object.entries(draftState.editedRows)) {
        const index = Number(indexText)
        const payload = buildRowUpdate(columns, rows[index], editedRow, uniqueKey)
        if (!payload) continue
        await onMutate('update', {schema, table, key: payload.key, values: payload.values})
      }
      for (const newRow of draftState.newRows) {
        await onMutate('insert', {schema, table, values: buildInsertValues(columns, newRow)})
      }
      onDraftChange(null)
      await onApply()
    } catch (error) {
      onSaveError(error instanceof Error ? error.message : '保存失败')
    }
  }

  const canGoNext = rows.length >= pageSize || truncated
  const rowOffset = (page - 1) * pageSize
  const activeFilterCount = filterRules.filter(isFilterRuleReady).length

  return <div className={`table-view ${status === 'running' ? 'loading' : ''}`}>
    {!editable && <p className="read-only-note">此表没有主键或唯一键，仅支持只读浏览与筛选排序</p>}
    {status === 'running' && <div className="table-loading-mask">正在加载数据…</div>}

    <div className="table-view-head">
      <div className="table-view-toolbar">
        <button type="button" className={`icon-tool ${showFilter ? 'active' : ''}`} aria-label="筛选" title="筛选" onClick={onToggleFilter}>⛃</button>
        {activeFilterCount > 0 && <span className="table-filter-badge">{activeFilterCount} 条筛选</span>}
        {sort && <span className="table-sort-badge">{sort.column} {sort.direction === 'asc' ? '↑' : '↓'}</span>}
        <span className="table-toolbar-spacer" />
        <button type="button" className="button ghost compact" disabled={rows.length === 0} onClick={onExport}>导出 CSV</button>
      </div>

      {showFilter && <TableFilterBuilder
        columns={columns}
        rules={filterRules}
        onApply={onFiltersApply}
        onClear={onFiltersClear}
      />}
    </div>

    <div className="result-scroll table-grid-scroll">
      <table className="result-grid table-data-grid">
        <thead>
          <tr>
            <th>#</th>
            {columns.map((column) => <th
              key={column.name}
              className={sort?.column === column.name ? 'sorted' : ''}
              onContextMenu={(event) => {
                event.preventDefault()
                setHeaderMenu({column, x: event.clientX, y: event.clientY})
              }}
            >
              {column.name}
              <small>{column.dataType}</small>
              {sort?.column === column.name && <span className="sort-indicator">{sort.direction === 'asc' ? '↑' : '↓'}</span>}
            </th>)}
          </tr>
        </thead>
        <tbody>
          {displayRows.length === 0 && columns.length > 0 && status !== 'running' && <tr className="table-empty-row">
            <td colSpan={columns.length + 1}>无匹配数据</td>
          </tr>}
          {displayRows.map((item, rowIndex) => <tr
            key={`${item.isNew ? 'new' : item.sourceIndex}-${rowIndex}`}
            className={selectedRow === rowIndex ? 'selected' : ''}
            onClick={() => onSelectRow(rowIndex)}
          >
            <th>{rowOffset + rowIndex + 1}</th>
            {item.values.map((value, columnIndex) => {
              const editing = editingCell?.row === rowIndex && editingCell.column === columnIndex
              return <td
                key={columnIndex}
                className={value === null ? 'cell-null' : ''}
                onDoubleClick={() => editable && setEditingCell({row: rowIndex, column: columnIndex})}
              >
                {editing
                  ? <input
                    autoFocus
                    className="cell-editor"
                    defaultValue={value === null ? '' : String(value)}
                    onBlur={(event) => {
                      updateCell(rowIndex, columnIndex, event.target.value)
                      setEditingCell(null)
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') (event.target as HTMLInputElement).blur()
                      if (event.key === 'Escape') setEditingCell(null)
                    }}
                  />
                  : value === null ? 'NULL' : String(value)}
              </td>
            })}
          </tr>)}
        </tbody>
      </table>
    </div>

    <div className="table-data-bar">
      <div className="table-row-tools">
        <button type="button" className="icon-tool" aria-label="新增行" title="新增行" disabled={!editable} onClick={addRow}>＋</button>
        <button type="button" className="icon-tool" aria-label="删除行" title="删除行" disabled={!editable || selectedRow === null} onClick={deleteSelectedRow}>－</button>
        <button type="button" className="icon-tool" aria-label="应用修改" title="应用修改" disabled={!editable || !dirty} onClick={() => void applyDraft()}>✓</button>
        <button type="button" className="icon-tool" aria-label="放弃修改" title="放弃修改" disabled={!dirty} onClick={onDiscard}>✕</button>
        <button type="button" className="icon-tool" aria-label="刷新" title="刷新" disabled={status === 'running'} onClick={onRefresh}>↻</button>
        <button type="button" className="icon-tool" aria-label="停止" title="停止" disabled={status !== 'running'} onClick={onStop}>■</button>
      </div>
      <div className="table-sql-bar">
        <code>{sql.replace(/\s+/g, ' ').trim()}</code>
        <div className="table-pagination">
          <button type="button" className="icon-tool tiny" aria-label="首页" disabled={page <= 1 || status === 'running'} onClick={() => onPageChange(1)}>|◀</button>
          <button type="button" className="icon-tool tiny" aria-label="上一页" disabled={page <= 1 || status === 'running'} onClick={() => onPageChange(page - 1)}>◀</button>
          <label className="page-input">
            <input
              type="number"
              min={1}
              value={page}
              disabled={status === 'running'}
              onChange={(event) => onPageChange(Math.max(1, Number(event.target.value) || 1))}
            />
          </label>
          <button type="button" className="icon-tool tiny" aria-label="下一页" disabled={!canGoNext || status === 'running'} onClick={() => onPageChange(page + 1)}>▶</button>
          <select value={pageSize} disabled={status === 'running'} onChange={(event) => onPageSizeChange(Number(event.target.value))}>
            {[50, 100, 200, 500, 1000].map((size) => <option key={size} value={size}>{size}</option>)}
          </select>
        </div>
      </div>
      <footer className={`execution-status table-status ${status}`} aria-live="polite"><span />{message}{truncated ? ' · 已达到结果上限' : ''}</footer>
    </div>

    {headerMenu && <ContextMenu x={headerMenu.x} y={headerMenu.y} items={headerMenuItems} onClose={() => setHeaderMenu(null)} />}
  </div>
}
