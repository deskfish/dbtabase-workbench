import {useId, useRef} from 'react'

export function FileField({
  label,
  accept,
  value,
  error,
  onChange,
}: {
  label: string
  accept?: string
  value: File | null
  error?: string
  onChange: (file: File | null) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const inputId = useId()

  return (
    <div className="oc-field">
      <span>{label}</span>
      <div className={`file-field ${error ? 'file-field-invalid' : ''}`.trim()}>
        <button
          type="button"
          className="oc-button"
          onClick={() => inputRef.current?.click()}
        >
          {value ? '更换文件' : '选择文件'}
        </button>
        <span className="file-field-name">{value ? value.name : '未选择文件'}</span>
        {value && (
          <button type="button" className="oc-button" onClick={() => onChange(null)}>
            清除
          </button>
        )}
      </div>
      <input
        ref={inputRef}
        id={inputId}
        aria-label={label}
        type="file"
        accept={accept}
        hidden
        onChange={(event) => onChange(event.target.files?.[0] ?? null)}
      />
      {error && <em role="alert">{error}</em>}
    </div>
  )
}
