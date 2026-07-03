import {useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties} from 'react'
import {createPortal} from 'react-dom'
import {Icon} from './Icon'

export function ColumnMultiSelect({
  ariaLabel,
  options,
  value,
  onChange,
  placeholder = '选择字段',
}: {
  ariaLabel: string
  options: string[]
  value: string[]
  onChange: (value: string[]) => void
  placeholder?: string
}) {
  const [open, setOpen] = useState(false)
  const [popoverStyle, setPopoverStyle] = useState<CSSProperties>({visibility: 'hidden'})
  const root = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const popover = useRef<HTMLDivElement>(null)
  const listboxId = `column-multi-${useId().replace(/:/g, '')}`

  useEffect(() => {
    if (!open) return
    function closeFromOutside(event: PointerEvent) {
      const target = event.target as Node
      if (!root.current?.contains(target) && !popover.current?.contains(target)) setOpen(false)
    }
    document.addEventListener('pointerdown', closeFromOutside)
    return () => document.removeEventListener('pointerdown', closeFromOutside)
  }, [open])

  useLayoutEffect(() => {
    if (!open) return
    const rect = trigger.current?.getBoundingClientRect()
    if (!rect) return
    const width = Math.max(rect.width, 260)
    setPopoverStyle({
      left: Math.min(rect.left, Math.max(8, window.innerWidth - width - 8)),
      top: rect.bottom + 4,
      width,
      visibility: 'visible',
    })
  }, [open, options.length, value.length])

  function toggle(column: string) {
    if (value.includes(column)) onChange(value.filter((item) => item !== column))
    else onChange([...value, column])
  }

  const label = value.length ? value.join(', ') : placeholder

  return <div className="column-multi-select" ref={root}>
    <button
      ref={trigger}
      type="button"
      className="column-multi-trigger"
      aria-label={ariaLabel}
      aria-expanded={open}
      aria-controls={listboxId}
      onClick={() => setOpen((current) => !current)}
    >
      <span className={value.length ? '' : 'column-multi-placeholder'}>{label}</span>
      <Icon name="chevron-down"/>
    </button>
    {open && createPortal(<div
      className="select-popover column-multi-popover"
      ref={popover}
      role="listbox"
      aria-label={ariaLabel}
      id={listboxId}
      style={popoverStyle}
    >
      {options.length === 0 && <p className="column-multi-empty">暂无可用字段</p>}
      {options.map((column) => {
        const checked = value.includes(column)
        const order = checked ? value.indexOf(column) + 1 : 0
        return <button
          key={column}
          type="button"
          className="select-option column-multi-option"
          role="option"
          aria-selected={checked}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => toggle(column)}
        >
          <span className="select-check">{checked ? <Icon name="check"/> : null}</span>
          <span>{column}</span>
          {checked && <span className="column-multi-order">{order}</span>}
        </button>
      })}
    </div>, document.body)}
  </div>
}
