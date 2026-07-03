export type DriverId = 'mysql' | 'postgres' | 'mongodb' | 'redis'

export type ConnectionCapabilities = {
  queryLanguage: 'sql' | 'mongo' | 'redis'
  documentBrowse?: boolean
  aggregateQuery?: boolean
  indexEdit?: boolean
  schemaEdit?: boolean
  keyBrowse?: boolean
  commandConsole?: boolean
  rowEdit?: boolean
  supportsTransactions?: boolean
  supportsSqlWorkbench?: boolean
}

export function isSqlDriver(driver: DriverId | ''): driver is 'mysql' | 'postgres' {
  return driver === 'mysql' || driver === 'postgres'
}

export function isMongoDriver(driver: DriverId | ''): boolean {
  return driver === 'mongodb'
}

export function isRedisDriver(driver: DriverId | ''): boolean {
  return driver === 'redis'
}

export function defaultPort(driver: DriverId): number {
  switch (driver) {
    case 'mysql': return 3306
    case 'postgres': return 5432
    case 'mongodb': return 27017
    case 'redis': return 6379
  }
}

export function sqlDriverOrDefault(driver: DriverId | ''): 'mysql' | 'postgres' {
  return driver === 'mysql' ? 'mysql' : 'postgres'
}

export function driverLabel(driver: DriverId | ''): string {
  switch (driver) {
    case 'mysql': return 'MySQL'
    case 'postgres': return 'PostgreSQL'
    case 'mongodb': return 'MongoDB'
    case 'redis': return 'Redis'
    default: return '数据库'
  }
}
