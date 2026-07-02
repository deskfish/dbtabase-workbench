import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import { Icon } from './Icon'

export type SelectOption = {value: string; label: string}

export function SelectControl({ariaLabel, value, options, onChange, disabled = false, className = ''}: {
  ariaLabel: string
  value: string
  options: SelectOption[]
  onChange: (value: string) => void
  disabled?: boolean
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const [popoverStyle, setPopoverStyle] = useState<CSSProperties>({visibility: 'hidden'})
  const root = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const popover = useRef<HTMLDivElement>(null)
  const listboxId = `select-${useId().replace(/:/g, '')}`
  const selectedIndex = Math.max(0, options.findIndex((item) => item.value === value))
  const selected = options[selectedIndex]

  function close({restoreFocus = false} = {}) {
    setOpen(false)
    if (restoreFocus) requestAnimationFrame(() => trigger.current?.focus())
  }

  function openList() {
    if (disabled || options.length === 0) return
    setActiveIndex(selectedIndex)
    setOpen(true)
  }

  function choose(index: number) {
    const option = options[index]
    if (!option) return
    onChange(option.value)
    close({restoreFocus: true})
  }

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (disabled) return
    if (event.key === 'Escape' && open) {
      event.preventDefault()
      close({restoreFocus: true})
      return
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      if (!open) {
        openList()
        return
      }
      const direction = event.key === 'ArrowDown' ? 1 : -1
      setActiveIndex((current) => (current + direction + options.length) % options.length)
      return
    }
    if (open && (event.key === 'Home' || event.key === 'End')) {
      event.preventDefault()
      setActiveIndex(event.key === 'Home' ? 0 : options.length - 1)
      return
    }
    if (open && (event.key === 'Enter' || event.key === ' ')) {
      event.preventDefault()
      choose(activeIndex)
    }
  }

  useEffect(() => {
    if (!open) return
    function closeFromOutside(event: PointerEvent) {
      const target = event.target as Node
      if (!root.current?.contains(target) && !popover.current?.contains(target)) close()
    }
    function closeFromEscape(event: globalThis.KeyboardEvent) {
      if (event.key === 'Escape') close({restoreFocus: true})
    }
    document.addEventListener('pointerdown', closeFromOutside)
    document.addEventListener('keydown', closeFromEscape)
    return () => {
      document.removeEventListener('pointerdown', closeFromOutside)
      document.removeEventListener('keydown', closeFromEscape)
    }
  }, [open])

  useLayoutEffect(() => {
    if (!open) return
    function position() {
      const rect = trigger.current?.getBoundingClientRect()
      if (!rect) return
      const gap = 6
      const viewportPadding = 8
      const estimatedHeight = Math.min(296, options.length * 42 + 12)
      const spaceBelow = window.innerHeight - rect.bottom - viewportPadding
      const placeAbove = spaceBelow < estimatedHeight && rect.top > spaceBelow
      setPopoverStyle({
        left: Math.min(rect.left, Math.max(viewportPadding, window.innerWidth - Math.max(rect.width, 180) - viewportPadding)),
        top: placeAbove ? Math.max(viewportPadding, rect.top - estimatedHeight - gap) : rect.bottom + gap,
        width: Math.max(rect.width, 180),
      })
    }
    position()
    window.addEventListener('resize', position)
    window.addEventListener('scroll', position, true)
    return () => {
      window.removeEventListener('resize', position)
      window.removeEventListener('scroll', position, true)
    }
  }, [open, options.length])

  useEffect(() => {
    if (!open) return
    popover.current?.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`)?.scrollIntoView?.({block: 'nearest'})
  }, [activeIndex, open])

  return <div className={`select-control ${className}`.trim()} ref={root}>
    <button
      type="button"
      className="select-trigger"
      ref={trigger}
      role="combobox"
      aria-label={ariaLabel}
      aria-expanded={open}
      aria-controls={listboxId}
      aria-activedescendant={open ? `${listboxId}-option-${activeIndex}` : undefined}
      disabled={disabled}
      onKeyDown={onKeyDown}
      onClick={() => open ? close() : openList()}
    >
      <span>{selected?.label ?? ''}</span><svg viewBox="0 0 16 16" aria-hidden="true"><path d="m4 6 4 4 4-4" /></svg>
    </button>
    {open && createPortal(<div
      className="select-popover"
      ref={popover}
      role="listbox"
      aria-label={ariaLabel}
      id={listboxId}
      style={popoverStyle}
    >
      {options.map((item, index) => <button
        type="button"
        className="select-option"
        role="option"
        aria-selected={item.value === value}
        id={`${listboxId}-option-${index}`}
        data-active={index === activeIndex}
        data-index={index}
        key={item.value}
        onPointerMove={() => setActiveIndex(index)}
        onClick={() => choose(index)}
      ><span className="select-check">{item.value === value && <Icon name="check" />}</span><span>{item.label}</span></button>)}
    </div>, document.body)}
  </div>
}
