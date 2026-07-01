import { useEffect, useRef, useState } from 'react'
import { Icon } from './Icon'

export type SelectOption = {value: string; label: string}

export function SelectControl({ariaLabel, value, options, onChange}: {
  ariaLabel: string
  value: string
  options: SelectOption[]
  onChange: (value: string) => void
}) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const selected = options.find((item) => item.value === value) ?? options[0]

  useEffect(() => {
    function close(event: PointerEvent) {
      if (!root.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [])

  return <div className="select-control" ref={root}>
    <button type="button" role="combobox" aria-label={ariaLabel} aria-expanded={open} aria-controls={`${ariaLabel}-options`} onClick={() => setOpen((value) => !value)}>
      <span>{selected?.label}</span><svg viewBox="0 0 16 16" aria-hidden="true"><path d="m4 6 4 4 4-4" /></svg>
    </button>
    {open && <div className="select-popover" role="listbox" aria-label={ariaLabel} id={`${ariaLabel}-options`}>
      {options.map((item) => <button
        type="button"
        role="option"
        aria-selected={item.value === value}
        key={item.value}
        onClick={() => { onChange(item.value); setOpen(false) }}
      ><span className="select-check">{item.value === value && <Icon name="check" />}</span>{item.label}</button>)}
    </div>}
  </div>
}
