import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'

export type ContextMenuItem = {
  label?: string
  action?: () => void
  disabled?: boolean
  separator?: boolean
}

export function ContextMenu({x, y, items, onClose}: {
  x: number
  y: number
  items: ContextMenuItem[]
  onClose: () => void
}) {
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (menuRef.current?.contains(event.target as Node)) return
      onClose()
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('mousedown', close)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('mousedown', close)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [onClose])

  useEffect(() => {
    const node = menuRef.current
    if (!node) return
    const rect = node.getBoundingClientRect()
    const left = Math.min(x, window.innerWidth - rect.width - 8)
    const top = Math.min(y, window.innerHeight - rect.height - 8)
    node.style.left = `${Math.max(8, left)}px`
    node.style.top = `${Math.max(8, top)}px`
  }, [x, y])

  return createPortal(
    <div ref={menuRef} className="context-menu" role="menu" style={{left: x, top: y}} onContextMenu={(event) => event.preventDefault()}>
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
