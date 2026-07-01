import { useState } from 'react'
import type { MutationInput } from '../../api/types'

type Column = {name:string; dataType?:string}

export function TableView({schema, table, columns, rows, uniqueKey, onMutate}: {
  schema?:string; table:string; columns:Column[]; rows:unknown[][]; uniqueKey:string[]
  onMutate:(operation:'update'|'delete', input:MutationInput)=>Promise<void>|void
}) {
  const [editing, setEditing] = useState<number | null>(null)
  const editable = uniqueKey.length > 0 && uniqueKey.every((key) => columns.some((column) => column.name === key))
  return <div className="table-view">
    {!editable && <p className="read-only-note">此表没有主键或唯一键，仅支持只读浏览</p>}
    <div className="result-scroll"><table className="result-grid"><thead><tr><th>#</th>{columns.map((column)=><th key={column.name}>{column.name}<small>{column.dataType}</small></th>)}{editable&&<th>操作</th>}</tr></thead>
      <tbody>{rows.map((row,index)=><tr key={index}><th>{index+1}</th>{row.map((value,column)=><td key={column}>{value === null ? 'NULL' : String(value)}</td>)}{editable&&<td><button type="button" className="button ghost" aria-label="编辑行" onClick={()=>setEditing(index)}>编辑</button></td>}</tr>)}</tbody></table></div>
    {editing !== null && <RowEditor schema={schema} table={table} columns={columns} row={rows[editing]} uniqueKey={uniqueKey} onCancel={()=>setEditing(null)} onMutate={async (operation,input)=>{await onMutate(operation,input); setEditing(null)}} />}
  </div>
}

function RowEditor({schema,table,columns,row,uniqueKey,onCancel,onMutate}: {
  schema?:string; table:string; columns:Column[]; row:unknown[]; uniqueKey:string[]; onCancel:()=>void
  onMutate:(operation:'update'|'delete', input:MutationInput)=>Promise<void>|void
}) {
  const initial = Object.fromEntries(columns.map((column,index)=>[column.name,row[index]]))
  const [values,setValues] = useState<Record<string,unknown>>(initial)
  const key = Object.fromEntries(uniqueKey.map((name)=>[name,initial[name]]))
  return <div className="dialog-backdrop"><form className="dialog" role="dialog" aria-label="编辑数据行" onSubmit={(event)=>{event.preventDefault(); void onMutate('update',{schema,table,key,values})}}>
    <span className="dialog-kicker">单行修改</span><h2>{schema ? `${schema}.` : ''}{table}</h2>
    <div className="row-fields">{columns.map((column)=><label key={column.name}>{column.name}<input value={values[column.name] == null ? '' : String(values[column.name])} onChange={(event)=>setValues({...values,[column.name]:event.target.value})} /></label>)}</div>
    <div className="dialog-actions"><button type="button" className="button danger" onClick={()=>void onMutate('delete',{schema,table,key})}>删除此行</button><span/><button type="button" className="button ghost" onClick={onCancel}>取消</button><button className="button primary" type="submit">保存修改</button></div>
  </form></div>
}
