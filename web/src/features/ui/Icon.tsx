import type { ReactNode } from 'react'

export type IconName = 'filter'|'search'|'share'|'settings'|'plus'|'minus'|'check'|'close'|'refresh'|'stop'|'play'|'download'|'edit'|'trash'|'chevron-left'|'chevrons-left'|'chevron-right'|'chevron-down'|'more-vertical'|'server'|'database'

const paths: Record<IconName, ReactNode> = {
  filter: <><path d="M4 5h16l-6.5 7.2V18l-3 1.5v-7.3z" /></>,
  search: <><circle cx="11" cy="11" r="6"/><path d="m16 16 4 4"/></>,
  share: <><circle cx="18" cy="5" r="2"/><circle cx="6" cy="12" r="2"/><circle cx="18" cy="19" r="2"/><path d="m8 11 8-5M8 13l8 5"/></>,
  settings: <><circle cx="12" cy="12" r="3"/><path d="M19 12a7 7 0 0 0-.1-1l2-1.6-2-3.4-2.5 1a8 8 0 0 0-1.7-1L14.3 3h-4.6L9.3 6a8 8 0 0 0-1.7 1L5.1 6 3 9.4 5.1 11a7 7 0 0 0 0 2L3 14.6 5.1 18l2.5-1a8 8 0 0 0 1.7 1l.4 3h4.6l.4-3a8 8 0 0 0 1.7-1l2.5 1 2-3.4-2-1.6a7 7 0 0 0 .1-1z"/></>,
  plus: <><path d="M12 5v14M5 12h14" /></>,
  minus: <><path d="M5 12h14" /></>,
  check: <><path d="m5 12 4 4 10-10" /></>,
  close: <><path d="m6 6 12 12M18 6 6 18" /></>,
  refresh: <><path d="M20 11a8 8 0 1 0-2.3 5.7M20 5v6h-6" /></>,
  stop: <><rect x="7" y="7" width="10" height="10" rx="1" /></>,
  play: <><path d="m8 5 11 7-11 7z" /></>,
  download: <><path d="M12 4v11m-4-4 4 4 4-4M5 20h14" /></>,
  edit: <><path d="m4 20 4.5-1 10-10-3.5-3.5-10 10zM13.5 7l3.5 3.5" /></>,
  trash: <><path d="M5 7h14M9 7V4h6v3m2 0-1 13H8L7 7m3 4v5m4-5v5" /></>,
  'chevron-left': <><path d="m15 18-6-6 6-6" /></>,
  'chevrons-left': <><path d="m13 18-6-6 6-6m5 12-6-6 6-6" /></>,
  'chevron-right': <><path d="m9 18 6-6-6-6" /></>,
  'chevron-down': <><path d="m6 9 6 6 6-6" /></>,
  'more-vertical': <><circle cx="12" cy="5" r="1.5" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none"/><circle cx="12" cy="19" r="1.5" fill="currentColor" stroke="none"/></>,
  server: <><rect x="4" y="4" width="16" height="5" rx="1"/><rect x="4" y="11" width="16" height="5" rx="1"/><circle cx="7" cy="6.5" r=".8" fill="currentColor" stroke="none"/><circle cx="7" cy="13.5" r=".8" fill="currentColor" stroke="none"/></>,
  database: <><ellipse cx="12" cy="6" rx="7" ry="2.5"/><path d="M5 6v5c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5V6"/><path d="M5 11v5c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5v-5"/></>,
}

export function Icon({name}: {name: IconName}) {
  return <svg className="ui-icon" viewBox="0 0 24 24" aria-hidden="true">{paths[name]}</svg>
}
