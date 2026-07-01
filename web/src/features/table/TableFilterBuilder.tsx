import { useEffect, useState } from 'react'
import { FILTER_OPERATORS, createEmptyFilterRule, normalizeFilterRules, type FilterJoin, type FilterOperator, type TableFilterRule } from './tableViewState'

export function TableFilterBuilder({
  columns,
  rules,
  onApply,
  onClear,
}: {
  columns: Array<{name: string}>
  rules: TableFilterRule[]
  onApply: (rules: TableFilterRule[]) => void
  onClear: () => void
}) {
  const defaultColumn = columns[0]?.name ?? ''
  const [draft, setDraft] = useState<TableFilterRule[]>(() => normalizeFilterRules(rules, defaultColumn))

  useEffect(() => {
    setDraft(normalizeFilterRules(rules, defaultColumn))
  }, [rules, defaultColumn])

  function patchRule(id: string, patch: Partial<TableFilterRule>) {
    setDraft((current) => current.map((rule) => rule.id === id ? {...rule, ...patch} : rule))
  }

  function addRule() {
    setDraft((current) => [...current, createEmptyFilterRule(defaultColumn)])
  }

  function removeRule(id: string) {
    setDraft((current) => {
      const next = current.filter((rule) => rule.id !== id)
      return normalizeFilterRules(next, defaultColumn)
    })
  }

  function toggleJoin(id: string) {
    setDraft((current) => current.map((rule) => {
      if (rule.id !== id) return rule
      const join: FilterJoin = rule.join === 'and' ? 'or' : 'and'
      return {...rule, join}
    }))
  }

  function applyDraft() {
    const next = normalizeFilterRules(draft, defaultColumn)
    onApply(next)
  }

  function clearDraft() {
    const next = [createEmptyFilterRule(defaultColumn)]
    setDraft(next)
    onClear()
  }

  return <div className="table-filter-panel">
    <div className="table-filter-table">
      <div className="table-filter-header" aria-hidden="true">
        <span className="col-check">启用</span>
        <span className="col-field">字段</span>
        <span className="col-op">运算符</span>
        <span className="col-value">值</span>
        <span className="col-join">连接</span>
        <span className="col-action" />
      </div>

      <div className="table-filter-rows">
        {draft.map((rule, index) => {
          const needsValue = rule.operator !== 'is_null' && rule.operator !== 'is_not_null'
          const joinLabel = rule.join === 'and' ? '并且' : '或者'
          return <div key={rule.id} className={`table-filter-row ${rule.enabled ? '' : 'disabled'}`}>
            <label className="col-check filter-check" title="启用此条件">
              <input type="checkbox" checked={rule.enabled} onChange={(event) => patchRule(rule.id, {enabled: event.target.checked})} />
            </label>
            <select className="col-field" value={rule.column} onChange={(event) => patchRule(rule.id, {column: event.target.value})}>
              {columns.map((column) => <option key={column.name} value={column.name}>{column.name}</option>)}
            </select>
            <select className="col-op" value={rule.operator} onChange={(event) => patchRule(rule.id, {operator: event.target.value as FilterOperator})}>
              {FILTER_OPERATORS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
            <div className="col-value">
              {needsValue
                ? <input value={rule.value} placeholder="输入筛选值" onChange={(event) => patchRule(rule.id, {value: event.target.value})} />
                : <span className="filter-value-hint">无需填写</span>}
            </div>
            <div className="col-join">
              {index < draft.length - 1
                ? <button
                  type="button"
                  className="filter-join-btn"
                  aria-label={`与下一条件：${joinLabel}`}
                  title="点击切换 并且 / 或者"
                  onClick={() => toggleJoin(rule.id)}
                >{joinLabel}</button>
                : <span className="filter-join-empty">—</span>}
            </div>
            <div className="col-action">
              <button
                type="button"
                className="icon-tool tiny filter-remove"
                aria-label="删除条件"
                title="删除条件"
                disabled={draft.length <= 1}
                onClick={() => removeRule(rule.id)}
              >－</button>
            </div>
          </div>
        })}
      </div>
    </div>

    <div className="table-filter-actions">
      <button type="button" className="button compact filter-add" onClick={addRule}>＋ 添加条件</button>
      <span className="filter-action-spacer" />
      <button type="button" className="button compact" onClick={clearDraft}>清空条件</button>
      <button type="button" className="button primary compact" onClick={applyDraft}>应用筛选</button>
    </div>
  </div>
}
