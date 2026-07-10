import {useId, useRef, type DragEvent, type KeyboardEvent} from 'react'
import './workbench.css'

function formatFileSize(size: number): string {
  if (size >= 1024 * 1024) return `${(size / 1024 / 1024).toFixed(1)} MB`
  if (size >= 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${size} B`
}

export function Dropzone({label, file, accept, error, hint, onChange}: {
  label: string
  file: File | null
  accept?: string
  error?: string
  hint?: string
  onChange(file: File | null): void
}) {
  const id = useId()
  const inputRef = useRef<HTMLInputElement>(null)

  function choose() {
    inputRef.current?.click()
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== 'Enter' && event.key !== ' ') return
    event.preventDefault()
    choose()
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault()
    onChange(event.dataTransfer.files[0] ?? null)
  }

  return (
    <div className="dropzone-field">
      <span className="dropzone-label">{label}</span>
      <div
        className={`dropzone ${error ? 'dropzone-invalid' : ''}`.trim()}
        role="button"
        tabIndex={0}
        aria-label={label}
        onClick={choose}
        onKeyDown={handleKeyDown}
        onDragOver={(event) => event.preventDefault()}
        onDrop={handleDrop}
      >
        <input
          ref={inputRef}
          id={id}
          className="visually-hidden"
          aria-label={`${label}文件选择`}
          type="file"
          accept={accept}
          onChange={(event) => onChange(event.target.files?.[0] ?? null)}
        />
        {file ? (
          <div className="dropzone-file">
            <span><strong>{file.name}</strong><small>{formatFileSize(file.size)}</small></span>
            <button type="button" className="oc-button" aria-label={`清除 ${file.name}`} onClick={(event) => { event.stopPropagation(); onChange(null) }}>清除</button>
          </div>
        ) : (
          <div className="dropzone-placeholder"><strong>拖放文件到这里</strong><span>或点击选择文件</span></div>
        )}
      </div>
      {(error || hint) && <small className={error ? 'field-error' : 'field-message'} role={error ? 'alert' : undefined}>{error ?? hint}</small>}
    </div>
  )
}
