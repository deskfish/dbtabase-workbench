import {useEffect, useState} from 'react'
import type {SchemaIndex} from '../../api/types'
import {ColumnMultiSelect} from '../ui/ColumnMultiSelect'
import {isValidSqlIdent} from '../workspace/ddl'
import {Icon} from '../ui/Icon'

function validateIndex(index: SchemaIndex): string {
  const name = index.name.trim()
  if (!name) return '请输入索引名称'
  if (!isValidSqlIdent(name)) return '索引名称仅支持字母、数字和下划线，且不能以数字开头'
  if (!index.columns.length) return '请至少选择一个字段'
  for (const column of index.columns) {
    if (!column.trim()) return '字段名不能为空'
    if (!isValidSqlIdent(column.trim())) return `字段「${column.trim()}」名称不合法`
  }
  return ''
}

export function IndexDialog({
  mode,
  initial,
  columnOptions,
  onSubmit,
  onClose,
}: {
  mode: 'create' | 'edit'
  initial?: SchemaIndex
  columnOptions: string[]
  onSubmit: (index: SchemaIndex) => void
  onClose: () => void
}) {
  const [name, setName] = useState(initial?.name ?? '')
  const [columns, setColumns] = useState<string[]>(initial?.columns ?? [])
  const [unique, setUnique] = useState(initial?.unique ?? false)
  const [error, setError] = useState('')

  useEffect(() => {
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', close)
    return () => window.removeEventListener('keydown', close)
  }, [onClose])

  const submit = () => {
    const index: SchemaIndex = {
      name: name.trim(),
      columns,
      unique,
    }
    const message = validateIndex(index)
    if (message) {
      setError(message)
      return
    }
    onSubmit(index)
  }

  return <div className="dialog-backdrop">
    <section className="dialog team-dialog schema-index-dialog" role="dialog" aria-modal="true" aria-label={mode === 'create' ? '新增索引' : '编辑索引'}>
      <header className="team-dialog-head">
        <div>
          <h2>{mode === 'create' ? '新增索引' : '编辑索引'}</h2>
          <p>{mode === 'create' ? '填写索引名称、字段与唯一性，保存修改后生效。' : '修改索引配置，保存修改后生效。'}</p>
        </div>
        <button className="icon-button" type="button" aria-label="关闭" onClick={onClose}><Icon name="close"/></button>
      </header>
      <div className="schema-index-form">
        <label>
          索引名称
          <input aria-label="索引名称" placeholder="例如 idx_user_email" value={name} onChange={(event) => { setName(event.target.value); setError('') }}/>
        </label>
        <label>
          字段
          <ColumnMultiSelect
            ariaLabel="索引字段"
            options={columnOptions}
            value={columns}
            onChange={(value) => { setColumns(value); setError('') }}
            placeholder="选择字段，按勾选顺序排列"
          />
        </label>
        <label className="schema-index-unique">
          <input aria-label="唯一索引" type="checkbox" checked={unique} onChange={(event) => setUnique(event.target.checked)}/>
          唯一索引
        </label>
      </div>
      <footer className="team-dialog-footer">
        <span className={error ? 'create-table-error' : 'create-table-hint'}>{error || '可多选字段，序号表示索引列顺序。'}</span>
        <div>
          <button className="oc-button" type="button" onClick={onClose}>取消</button>
          <button className="oc-button primary" type="button" onClick={submit}>{mode === 'create' ? '添加' : '保存'}</button>
        </div>
      </footer>
    </section>
  </div>
}
