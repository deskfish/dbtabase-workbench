import { useEffect, useRef, type KeyboardEvent as ReactKeyboardEvent, type RefObject } from 'react'
import { createPortal } from 'react-dom'

export type ContextMenuItem = {
  label?: string
  action?: () => void
  disabled?: boolean
  separator?: boolean
}

export function ContextMenu({x, y, items, onClose, ariaLabel = '操作菜单', returnFocusRef}: {
  x: number
  y: number
  items: ContextMenuItem[]
  onClose: () => void
  ariaLabel?: string
  returnFocusRef?: RefObject<HTMLElement | null>
}) {
  const menuRef = useRef<HTMLDivElement>(null)

  function enabledItems() {
    return Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)') ?? [])
  }

  function closeAndReturnFocus() {
    onClose()
    requestAnimationFrame(() => returnFocusRef?.current?.focus())
  }

  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (menuRef.current?.contains(event.target as Node)) return
      onClose()
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeAndReturnFocus()
    }
    window.addEventListener('mousedown', close)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('mousedown', close)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [onClose, returnFocusRef])

  useEffect(() => {
    const node = menuRef.current
    if (!node) return
    const rect = node.getBoundingClientRect()
    const left = Math.min(x, window.innerWidth - rect.width - 8)
    const top = Math.min(y, window.innerHeight - rect.height - 8)
    node.style.left = `${Math.max(8, left)}px`
    node.style.top = `${Math.max(8, top)}px`
    enabledItems()[0]?.focus()
  }, [x, y])

  function navigate(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
    event.preventDefault()
    const enabled = enabledItems()
    if (enabled.length === 0) return
    const current = enabled.indexOf(document.activeElement as HTMLButtonElement)
    const next = event.key === 'Home'
      ? enabled[0]
      : event.key === 'End'
        ? enabled.at(-1)
        : enabled[(current + (event.key === 'ArrowDown' ? 1 : -1) + enabled.length) % enabled.length]
    next?.focus()
  }

  return createPortal(
    <div ref={menuRef} className="context-menu" role="menu" aria-label={ariaLabel} style={{left: x, top: y}} onKeyDown={navigate} onContextMenu={(event) => event.preventDefault()}>
      {items.map((item, index) => item.separator
        ? <div key={`sep-${index}`} className="context-menu-separator" role="separator" />
        : <button
          key={item.label ?? `item-${index}`}
          type="button"
          role="menuitem"
          className="context-menu-item"
          disabled={item.disabled}
          onClick={() => {
            item.action?.()
            onClose()
          }}
        >
          {item.label}
        </button>)}
    </div>,
    document.body,
  )
}
