import type { DriverId } from '../../api/driver'

export type DriverBadgeSpec = {
  label: string
  tone: 'postgres' | 'mysql' | 'mongodb' | 'redis'
}

export function driverBadgeSpec(driver: DriverId): DriverBadgeSpec {
  switch (driver) {
    case 'postgres': return {label: 'PostgreSQL', tone: 'postgres'}
    case 'mysql': return {label: 'MySQL', tone: 'mysql'}
    case 'mongodb': return {label: 'MongoDB', tone: 'mongodb'}
    case 'redis': return {label: 'Redis', tone: 'redis'}
  }
}

export function connectionDatabaseLabel(saved: {driver: DriverId; database: string; user: string}, activeDatabase?: string, isActive?: boolean): string {
  if (isActive && activeDatabase) return activeDatabase
  if (saved.driver === 'redis') return saved.database ? `DB ${saved.database}` : 'DB 0'
  return saved.database || saved.user || '—'
}

export function DriverBadge({driver}: {driver: DriverId}) {
  const spec = driverBadgeSpec(driver)
  return <span className={`driver-badge driver-badge-${spec.tone}`}>{spec.label}</span>
}
