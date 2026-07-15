import { useState, type FormEvent } from 'react'
import { THEME_OPTIONS, type ThemeId } from '../../storage/theme'
import { SelectControl } from '../ui/SelectControl'

export function ProfileDialog({initialNickname = '', initialTheme = 'slate', onCancel, onSave}: {
  initialNickname?: string
  initialTheme?: ThemeId
  onCancel?: () => void
  onSave: (payload: {nickname: string; theme: ThemeId}) => void
}) {
  const [nickname, setNickname] = useState(initialNickname)
  const [theme, setTheme] = useState<ThemeId>(initialTheme)
  const required = !onCancel

  function submit(event: FormEvent) {
    event.preventDefault()
    if (!nickname.trim()) return
    onSave({nickname: nickname.trim(), theme})
  }

  return <div className="dialog-backdrop">
    <form role="dialog" aria-modal="true" aria-label="设置昵称" className="dialog profile-dialog" onSubmit={submit}>
      <span className="dialog-kicker">个人偏好</span>
      <h2>{required ? '欢迎使用 Database Workbench' : '编辑资料'}</h2>
      <p>昵称用于服务端同步连接配置；界面配色可随时切换。</p>
      <label>昵称<input aria-label="昵称" required autoFocus value={nickname} onChange={(e)=>setNickname(e.target.value)} placeholder="例如：小明" maxLength={32} /></label>
      <label className="theme-field">界面配色
        <SelectControl ariaLabel="界面配色" value={theme} options={THEME_OPTIONS.map((item)=>({value:item.id,label:item.label}))} onChange={(value)=>setTheme(value as ThemeId)}/>
      </label>
      <div className="dialog-actions">
        {onCancel && <button type="button" className="oc-button" onClick={onCancel}>取消</button>}
        <button type="submit" className="oc-button primary" disabled={!nickname.trim()}>保存</button>
      </div>
    </form>
  </div>
}
