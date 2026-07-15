import { useState } from 'react'
import type { QueryRisk } from '../../api/types'

export function RiskDialog({risk, onCancel, onConfirm}: {risk:QueryRisk; onCancel:()=>void; onConfirm:(target?:string)=>void}) {
  const [target, setTarget] = useState('')
  return <div className="dialog-backdrop">
    <section role="dialog" aria-modal="true" aria-label="确认危险操作" className="dialog danger-dialog">
      <span className="dialog-kicker">危险操作</span>
      <h2>确认执行这条 SQL？</h2>
      <p>{risk.reason ?? '此操作可能修改或删除大量数据。'}</p>
      {risk.level === 'type_target' && <label>输入对象名称 <strong>{risk.target}</strong>
        <input autoFocus value={target} onChange={(event) => setTarget(event.target.value)} />
      </label>}
      <div className="dialog-actions">
        <button type="button" className="oc-button" onClick={onCancel}>取消</button>
        <button type="button" className="oc-button danger" disabled={risk.level === 'type_target' && target !== risk.target} onClick={() => onConfirm(target)}>确认执行</button>
      </div>
    </section>
  </div>
}
