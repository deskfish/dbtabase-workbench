import type {ReactNode} from 'react'

export function FormRow({children, className = ''}: {children: ReactNode; className?: string}) {
  return <div className={`oc-form-row ${className}`.trim()}>{children}</div>
}
