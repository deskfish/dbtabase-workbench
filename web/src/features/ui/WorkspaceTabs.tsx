import {useRef, type KeyboardEvent} from 'react'
import './workbench.css'

export type WorkspaceTab = {value: string; label: string; disabled?: boolean}

export function WorkspaceTabs({ariaLabel, value, tabs, onChange}: {
  ariaLabel: string
  value: string
  tabs: WorkspaceTab[]
  onChange(value: string): void
}) {
  const refs = useRef<Array<HTMLButtonElement | null>>([])

  function move(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
    event.preventDefault()
    const enabled = tabs.map((tab, tabIndex) => ({tab, tabIndex})).filter(({tab}) => !tab.disabled)
    const current = enabled.findIndex((item) => item.tabIndex === index)
    const next = event.key === 'Home'
      ? enabled[0]
      : event.key === 'End'
        ? enabled.at(-1)
        : enabled[(current + (event.key === 'ArrowRight' ? 1 : -1) + enabled.length) % enabled.length]
    if (!next) return
    refs.current[next.tabIndex]?.focus()
    onChange(next.tab.value)
  }

  return (
    <div className="workspace-tabs" role="tablist" aria-label={ariaLabel}>
      {tabs.map((tab, index) => (
        <button
          ref={(node) => { refs.current[index] = node }}
          key={tab.value}
          className="workspace-tab"
          type="button"
          role="tab"
          aria-selected={tab.value === value}
          tabIndex={tab.value === value ? 0 : -1}
          disabled={tab.disabled}
          onKeyDown={(event) => move(event, index)}
          onClick={() => onChange(tab.value)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  )
}
