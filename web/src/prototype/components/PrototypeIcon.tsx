import type { ReactNode } from 'react'

export type PrototypeIconName = 'database'|'table'|'search'|'refresh'|'plus'|'edit'|'trash'|'share'|'team'|'chevron'|'filter'|'sort'|'columns'|'density'|'download'|'copy'|'more'|'play'|'stop'|'close'|'check'|'history'|'settings'

const paths: Record<PrototypeIconName, ReactNode> = {
  database:<><ellipse cx="12" cy="5" rx="7" ry="3"/><path d="M5 5v6c0 1.7 3.1 3 7 3s7-1.3 7-3V5M5 11v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6"/></>,
  table:<><rect x="4" y="5" width="16" height="14" rx="1"/><path d="M4 10h16M9 5v14M15 5v14"/></>,
  search:<><circle cx="10.5" cy="10.5" r="6"/><path d="m15 15 5 5"/></>,
  refresh:<><path d="M20 11a8 8 0 1 0-2.5 5.8M20 5v6h-6"/></>, plus:<path d="M12 5v14M5 12h14"/>,
  edit:<><path d="m4 20 4-1 10-10-3-3L5 16zM13.5 7.5l3 3"/></>, trash:<><path d="M5 7h14M9 7V4h6v3m2 0-1 13H8L7 7"/></>,
  share:<><circle cx="18" cy="5" r="2"/><circle cx="6" cy="12" r="2"/><circle cx="18" cy="19" r="2"/><path d="m8 11 8-5M8 13l8 5"/></>,
  team:<><circle cx="9" cy="8" r="3"/><circle cx="17" cy="9" r="2"/><path d="M3 20c.5-4 2.5-6 6-6s5.5 2 6 6M15 14c3-.3 5 1.5 5.5 5"/></>,
  chevron:<path d="m9 6 6 6-6 6"/>, filter:<path d="M4 5h16l-6 7v6l-4 2v-8z"/>, sort:<path d="M8 5v14m0 0-3-3m3 3 3-3M16 19V5m0 0-3 3m3-3 3 3"/>,
  columns:<><rect x="4" y="5" width="16" height="14" rx="1"/><path d="M10 5v14M15 5v14"/></>, density:<><path d="M5 7h14M5 12h14M5 17h14"/></>,
  download:<><path d="M12 4v11m-4-4 4 4 4-4M5 20h14"/></>, copy:<><rect x="8" y="8" width="11" height="11" rx="1"/><path d="M16 8V5H5v11h3"/></>,
  more:<><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></>, play:<path d="m8 5 11 7-11 7z"/>, stop:<rect x="7" y="7" width="10" height="10" rx="1"/>,
  close:<path d="m6 6 12 12M18 6 6 18"/>, check:<path d="m5 12 4 4 10-10"/>, history:<><circle cx="12" cy="12" r="8"/><path d="M12 7v5l3 2"/></>,
  settings:<><circle cx="12" cy="12" r="3"/><path d="M12 3v3m0 12v3M3 12h3m12 0h3M5.6 5.6l2.1 2.1m8.6 8.6 2.1 2.1m0-12.8-2.1 2.1m-8.6 8.6-2.1 2.1"/></>,
}

export function PrototypeIcon({name}: {name: PrototypeIconName}) {
  return <svg className="proto-icon" viewBox="0 0 24 24" aria-hidden="true">{paths[name]}</svg>
}
