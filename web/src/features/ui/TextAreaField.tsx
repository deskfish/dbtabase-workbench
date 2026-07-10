import {useId, type TextareaHTMLAttributes} from 'react'
import './workbench.css'

export function TextAreaField({label, hint, error, className = '', id, ...props}: {
  label: string
  hint?: string
  error?: string
} & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const generatedId = useId()
  const fieldId = id ?? props.name ?? generatedId
  const messageId = `${fieldId}-message`
  return (
    <div className={`oc-field ${className}`.trim()}>
      <label htmlFor={fieldId}>{label}</label>
      <textarea
        className={error ? 'oc-field-invalid' : undefined}
        {...props}
        id={fieldId}
        aria-invalid={error ? true : undefined}
        aria-describedby={hint || error ? messageId : undefined}
      />
      {(error || hint) && <small id={messageId} className={error ? 'field-error' : 'field-message'} role={error ? 'alert' : undefined}>{error ?? hint}</small>}
    </div>
  )
}
