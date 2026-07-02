import type { DataColumn, DataRow } from '../model'

type Props = {
  columns: DataColumn[]
  rows: DataRow[]
  density: 'comfortable'|'compact'
  selectedRow: number|null
  onSelectRow: (index:number)=>void
}

export function DataGrid({columns,rows,density,selectedRow,onSelectRow}:Props) {
  return <div className="proto-grid-scroll">
    <table className="proto-data-grid" role="grid" data-density={density} aria-label="表数据">
      <thead><tr><th className="row-number">#</th>{columns.map(column=><th key={column.key} style={{width:column.width,minWidth:column.width}}><strong>{column.label}</strong><small>{column.type}</small></th>)}</tr></thead>
      <tbody>{rows.map((row,rowIndex)=><tr key={rowIndex} className={selectedRow===rowIndex?'selected':''} onClick={()=>onSelectRow(rowIndex)}><th className="row-number">{rowIndex+1}</th>{columns.map(column=><td key={column.key} title={String(row[column.key]??'NULL')}>{row[column.key]===null?<i>NULL</i>:String(row[column.key])}</td>)}</tr>)}</tbody>
    </table>
  </div>
}
