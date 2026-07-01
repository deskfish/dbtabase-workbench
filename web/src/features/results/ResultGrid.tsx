import type { QueryColumn } from '../../api/types'

export function ResultGrid({columns, rows}: {columns: QueryColumn[]; rows: unknown[][]}) {
  if (columns.length === 0) return <div className="empty-state">查询完成后，结果会显示在这里</div>
  return <div className="result-scroll" tabIndex={0} aria-label="查询结果">
    <table className="result-grid">
      <thead><tr><th aria-label="行号">#</th>{columns.map((column) => <th key={column.name}>{column.name}<small>{column.databaseType}</small></th>)}</tr></thead>
      <tbody>{rows.map((row, rowIndex) => <tr key={rowIndex}>
        <th>{rowIndex + 1}</th>
        {columns.map((column, columnIndex) => <td key={`${column.name}-${columnIndex}`}>{renderCell(row[columnIndex])}</td>)}
      </tr>)}</tbody>
    </table>
  </div>
}

function renderCell(value: unknown) {
  if (value === null) return <span className="cell-null">NULL</span>
  if (value === '') return <span className="cell-empty" aria-label="空字符串">''</span>
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}
