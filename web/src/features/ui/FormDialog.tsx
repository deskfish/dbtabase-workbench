import {FormEvent, useEffect, useRef, type ReactNode} from 'react'

export function FormDialog({
  title,
  description,
  submitLabel,
  cancelLabel = '取消',
  submitting = false,
  wide = false,
  onCancel,
  onSubmit,
  children,
}: {
  title: string
  description?: string
  submitLabel: string
  cancelLabel?: string
  submitting?: boolean
  wide?: boolean
  onCancel: () => void
  onSubmit: (event: FormEvent) => void
  children: ReactNode
}) {
  const formRef = useRef<HTMLFormElement>(null)
  const onCancelRef = useRef(onCancel)
  onCancelRef.current = onCancel

  useEffect(() => {
    const firstField = formRef.current?.querySelector<HTMLElement>('input:not([type=checkbox]), textarea')
    firstField?.focus()
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onCancelRef.current()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [])

  return (
    <div className="dialog-backdrop" onClick={onCancel}>
      <form
        ref={formRef}
        className={`dialog ${wide ? 'dialog-wide' : ''}`.trim()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(event) => event.stopPropagation()}
        onSubmit={onSubmit}
      >
        <span className="dialog-kicker">表单</span>
        <h2>{title}</h2>
        {description && <p>{description}</p>}
        <div className="dialog-form">{children}</div>
        <div className="dialog-actions">
          <button type="button" className="oc-button" disabled={submitting} onClick={onCancel}>{cancelLabel}</button>
          <button type="submit" className="oc-button primary" disabled={submitting}>
            {submitting ? '提交中…' : submitLabel}
          </button>
        </div>
      </form>
    </div>
  )
}
