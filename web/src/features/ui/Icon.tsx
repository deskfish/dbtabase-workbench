import type { ReactNode } from 'react'

export type IconName = 'filter'|'plus'|'minus'|'check'|'close'|'refresh'|'stop'|'download'|'edit'|'trash'|'chevron-left'|'chevrons-left'|'chevron-right'

const paths: Record<IconName, ReactNode> = {
  filter: <><path d="M4 5h16l-6.5 7.2V18l-3 1.5v-7.3z" /></>,
  plus: <><path d="M12 5v14M5 12h14" /></>,
  minus: <><path d="M5 12h14" /></>,
  check: <><path d="m5 12 4 4 10-10" /></>,
  close: <><path d="m6 6 12 12M18 6 6 18" /></>,
  refresh: <><path d="M20 11a8 8 0 1 0-2.3 5.7M20 5v6h-6" /></>,
  stop: <><rect x="7" y="7" width="10" height="10" rx="1" /></>,
  download: <><path d="M12 4v11m-4-4 4 4 4-4M5 20h14" /></>,
  edit: <><path d="m4 20 4.5-1 10-10-3.5-3.5-10 10zM13.5 7l3.5 3.5" /></>,
  trash: <><path d="M5 7h14M9 7V4h6v3m2 0-1 13H8L7 7m3 4v5m4-5v5" /></>,
  'chevron-left': <><path d="m15 18-6-6 6-6" /></>,
  'chevrons-left': <><path d="m13 18-6-6 6-6m5 12-6-6 6-6" /></>,
  'chevron-right': <><path d="m9 18 6-6-6-6" /></>,
}

export function Icon({name}: {name: IconName}) {
  return <svg className="ui-icon" viewBox="0 0 24 24" aria-hidden="true">{paths[name]}</svg>
}
