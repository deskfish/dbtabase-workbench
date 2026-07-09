import type {InputHTMLAttributes} from 'react'
import {useId} from 'react'

export function TextField({
  label,
  error,
  className = '',
  id,
  ...props
}: {
  label: string
  error?: string
} & InputHTMLAttributes<HTMLInputElement>) {
  const generatedId = useId()
  const fieldId = id ?? props.name ?? generatedId
  return (
    <label className={`oc-field ${className}`.trim()} htmlFor={fieldId}>
      <span>{label}</span>
      <input className={error ? 'oc-field-invalid' : undefined} {...props} id={fieldId} />
      {error && <em role="alert">{error}</em>}
    </label>
  )
}
