import type {InputHTMLAttributes} from 'react'

export function Checkbox({
  label,
  description,
  compact = false,
  className = '',
  ...props
}: {
  label: string
  description?: string
  compact?: boolean
} & Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>) {
  const id = props.id ?? props.name
  return (
    <label className={`oc-checkbox ${compact ? 'oc-checkbox-compact' : ''} ${className}`.trim()} htmlFor={id}>
      <input type="checkbox" {...props} id={id} />
      <span className="oc-checkbox-box" aria-hidden="true" />
      <span>
        <strong>{label}</strong>
        {description && <small>{description}</small>}
      </span>
    </label>
  )
}
