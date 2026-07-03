import {useEffect, useMemo, useState} from 'react'
import {buildColumnTypeOptions, defaultColumnType} from '../schema/columnTypes'
import {ComboboxControl} from '../ui/ComboboxControl'
import {Icon} from '../ui/Icon'
import {isValidSqlIdent, type CreateTableColumn} from './ddl'

export type CreateTableColumnDraft = {
  name: string
  type: string
  comment: string
  primary: boolean
}

function defaultColumns(driver: 'mysql' | 'postgres'): CreateTableColumnDraft[] {
  return [{name: 'id', type: 'bigint', comment: '', primary: true}]
}

function validateDraft(tableName: string, columns: CreateTableColumnDraft[]): string {
  const name = tableName.trim()
  if (!name) return '请输入表名'
  if (!isValidSqlIdent(name)) return '表名仅支持字母、数字和下划线，且不能以数字开头'
  if (!columns.length) return '请至少添加一个字段'
  const seen = new Set<string>()
  for (const [index, column] of columns.entries()) {
    const fieldName = column.name.trim()
    if (!fieldName) return `第 ${index + 1} 行字段名不能为空`
    if (!isValidSqlIdent(fieldName)) return `字段「${fieldName}」名称不合法`
    if (seen.has(fieldName.toLowerCase())) return `字段名「${fieldName}」重复`
    seen.add(fieldName.toLowerCase())
    if (!column.type.trim()) return `字段「${fieldName}」类型不能为空`
  }
  return ''
}

export function CreateTableDialog({
  database,
  driver,
  onCreate,
  onClose,
}: {
  database: string
  driver: 'mysql' | 'postgres'
  onCreate: (tableName: string, columns: CreateTableColumn[]) => void
  onClose: () => void
}) {
  const [tableName, setTableName] = useState('')
  const [columns, setColumns] = useState<CreateTableColumnDraft[]>(() => defaultColumns(driver))
  const [error, setError] = useState('')
  const typeOptions = useMemo(() => buildColumnTypeOptions(driver, columns.map((column) => column.type)), [columns, driver])

  useEffect(() => {
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', close)
    return () => window.removeEventListener('keydown', close)
  }, [onClose])

  const changeColumn = (index: number, patch: Partial<CreateTableColumnDraft>) => {
    setColumns((current) => current.map((column, row) => {
      if (row !== index) {
        if (patch.primary) return {...column, primary: false}
        return column
      }
      return {...column, ...patch}
    }))
    setError('')
  }

  const addColumn = () => {
    setColumns((current) => [...current, {name: `column_${current.length + 1}`, type: defaultColumnType(driver), comment: '', primary: false}])
    setError('')
  }

  const removeColumn = (index: number) => {
    setColumns((current) => (current.length <= 1 ? current : current.filter((_, row) => row !== index)))
    setError('')
  }

  const submit = () => {
    const message = validateDraft(tableName, columns)
    if (message) {
      setError(message)
      return
    }
    onCreate(
      tableName.trim(),
      columns.map((column) => ({
        name: column.name.trim(),
        type: column.type.trim(),
        comment: column.comment.trim() || undefined,
        primary: column.primary || undefined,
      })),
    )
  }

  return <div className="dialog-backdrop"><section className="dialog team-dialog create-table-dialog" role="dialog" aria-modal="true" aria-label="新建表">
    <header className="team-dialog-head"><div><h2>新建表</h2><p>在数据库「{database}」中创建新表，填写表名与字段信息。</p></div><button className="icon-button" aria-label="关闭新建表" onClick={onClose}><Icon name="close"/></button></header>
    <div className="create-table-toolbar">
      <label>表名<input aria-label="表名" placeholder="例如 users" value={tableName} onChange={(event) => { setTableName(event.target.value); setError('') }}/></label>
      <button className="button primary button-with-icon" type="button" onClick={addColumn}><Icon name="plus"/>新增字段</button>
    </div>
    <div className="team-table-wrap create-table-wrap">
      <div className="create-table-head"><span>#</span><span>字段名</span><span>数据类型</span><span>主键</span><span>备注</span><span>操作</span></div>
      <div className="create-table-body" role="list">{columns.map((column, index) => <article key={`${column.name}-${index}`} role="listitem" className="create-table-row">
        <span>{index + 1}</span>
        <input aria-label={`字段名 ${index + 1}`} placeholder="字段名" value={column.name} onChange={(event) => changeColumn(index, {name: event.target.value})}/>
        <ComboboxControl className="create-table-type" ariaLabel={`数据类型 ${index + 1}`} value={column.type} options={typeOptions} onChange={(value) => changeColumn(index, {type: value})}/>
        <input aria-label={`主键 ${index + 1}`} type="checkbox" checked={column.primary} onChange={(event) => changeColumn(index, {primary: event.target.checked})}/>
        <input aria-label={`备注 ${index + 1}`} placeholder="备注" value={column.comment} onChange={(event) => changeColumn(index, {comment: event.target.value})}/>
        <button className="icon-button danger" type="button" aria-label={`删除字段 ${column.name || index + 1}`} disabled={columns.length <= 1} onClick={() => removeColumn(index)}><Icon name="trash"/></button>
      </article>)}</div>
    </div>
    <footer className="team-dialog-footer"><span className={error ? 'create-table-error' : 'create-table-hint'}>{error || '字段类型可直接输入或从下拉选择；主键仅建议设置一列。'}</span><div><button className="button" type="button" onClick={onClose}>取消</button><button className="button primary" type="button" disabled={!tableName.trim() || !columns.length} onClick={submit}>创建表</button></div></footer>
  </section></div>
}
