import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import { Icon } from './Icon'

export type ComboboxOption = {value: string; label: string}

export function ComboboxControl({ariaLabel, value, options, onChange, disabled = false, className = '', placeholder = ''}: {
  ariaLabel: string
  value: string
  options: ComboboxOption[]
  onChange: (value: string) => void
  disabled?: boolean
  className?: string
  placeholder?: string
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState(value)
  const [browseAll, setBrowseAll] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const [popoverStyle, setPopoverStyle] = useState<CSSProperties>({visibility: 'hidden'})
  const root = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLInputElement>(null)
  const popover = useRef<HTMLDivElement>(null)
  const listboxId = `combobox-${useId().replace(/:/g, '')}`

  useEffect(() => {
    setQuery(value)
  }, [value])

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return options
    return options.filter((item) => item.label.toLowerCase().includes(needle) || item.value.toLowerCase().includes(needle))
  }, [options, query])
  const visibleOptions = browseAll ? options : filtered
  const browseMenuWidth = useMemo(() => {
    const longest = options.reduce((max, item) => Math.max(max, item.label.length), 0)
    const estimated = longest * 7.4 + 52
    return Math.min(Math.max(estimated, 240), 380)
  }, [options])

  useEffect(() => {
    setActiveIndex(0)
  }, [query, open, browseAll])

  function close({restoreFocus = false} = {}) {
    setOpen(false)
    setBrowseAll(false)
    if (restoreFocus) requestAnimationFrame(() => input.current?.focus())
  }

  function openList(all = false) {
    if (disabled) return
    setBrowseAll(all)
    setOpen(true)
  }

  function choose(option: ComboboxOption) {
    setQuery(option.value)
    onChange(option.value)
    close({restoreFocus: true})
  }

  function onInputChange(next: string) {
    setBrowseAll(false)
    setQuery(next)
    onChange(next)
    if (!open) setOpen(true)
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (disabled) return
    if (event.key === 'Escape') {
      if (open) {
        event.preventDefault()
        setQuery(value)
        close({restoreFocus: true})
      }
      return
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      if (!open) {
        openList(false)
        return
      }
      if (visibleOptions.length === 0) return
      const direction = event.key === 'ArrowDown' ? 1 : -1
      setActiveIndex((current) => (current + direction + visibleOptions.length) % visibleOptions.length)
      return
    }
    if (open && event.key === 'Enter') {
      const option = visibleOptions[activeIndex]
      if (option) {
        event.preventDefault()
        choose(option)
      }
    }
  }

  useEffect(() => {
    if (!open) return
    function closeFromOutside(event: PointerEvent) {
      const target = event.target as Node
      if (!root.current?.contains(target) && !popover.current?.contains(target)) close()
    }
    document.addEventListener('pointerdown', closeFromOutside)
    return () => document.removeEventListener('pointerdown', closeFromOutside)
  }, [open])

  useLayoutEffect(() => {
    if (!open) return
    function position() {
      const rect = input.current?.getBoundingClientRect()
      if (!rect) return
      const gap = 4
      const viewportPadding = 8
      const popoverWidth = browseAll ? Math.max(rect.width, browseMenuWidth) : Math.max(rect.width, 220)
      const estimatedHeight = Math.min(browseAll ? 360 : 240, Math.max(visibleOptions.length, 1) * 34 + 12)
      const spaceBelow = window.innerHeight - rect.bottom - viewportPadding
      const placeAbove = spaceBelow < estimatedHeight && rect.top > spaceBelow
      setPopoverStyle({
        left: Math.min(rect.left, Math.max(viewportPadding, window.innerWidth - popoverWidth - viewportPadding)),
        top: placeAbove ? Math.max(viewportPadding, rect.top - estimatedHeight - gap) : rect.bottom + gap,
        width: popoverWidth,
        visibility: 'visible',
      })
    }
    position()
    window.addEventListener('resize', position)
    window.addEventListener('scroll', position, true)
    return () => {
      window.removeEventListener('resize', position)
      window.removeEventListener('scroll', position, true)
    }
  }, [open, visibleOptions.length, browseAll, browseMenuWidth])

  useEffect(() => {
    if (!open) return
    popover.current?.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`)?.scrollIntoView?.({block: 'nearest'})
  }, [activeIndex, open])

  return <div className={`combobox-control ${className}`.trim()} ref={root}>
    <div className="combobox-input-wrap">
      <input
        ref={input}
        type="text"
        className="combobox-input"
        role="combobox"
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-controls={listboxId}
        aria-autocomplete="list"
        aria-activedescendant={open && filtered[activeIndex] ? `${listboxId}-option-${activeIndex}` : undefined}
        value={query}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(event) => onInputChange(event.target.value)}
        onFocus={() => openList(false)}
        onKeyDown={onKeyDown}
      />
      <button
        type="button"
        className="combobox-toggle"
        aria-label={`${ariaLabel} 选项`}
        aria-expanded={open && browseAll}
        disabled={disabled}
        tabIndex={-1}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => {
          if (open && browseAll) close({restoreFocus: true})
          else openList(true)
        }}
      >
        <Icon name="chevron-down" />
      </button>
    </div>
    {open && visibleOptions.length > 0 && createPortal(<div
      className={`select-popover combobox-popover ${browseAll ? 'browse-all' : ''}`}
      ref={popover}
      role="listbox"
      aria-label={ariaLabel}
      id={listboxId}
      style={popoverStyle}
    >
      {visibleOptions.map((item, index) => <button
        type="button"
        className="select-option"
        role="option"
        aria-selected={item.value === value}
        id={`${listboxId}-option-${index}`}
        data-active={index === activeIndex}
        data-index={index}
        key={`${item.value}-${index}`}
        onPointerMove={() => setActiveIndex(index)}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => choose(item)}
      ><span className="select-check">{item.value === value && <Icon name="check" />}</span><span>{item.label}</span></button>)}
    </div>, document.body)}
  </div>
}
