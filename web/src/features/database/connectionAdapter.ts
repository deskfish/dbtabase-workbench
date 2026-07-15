import type {Connection, DatabaseDriver, WorkbenchTarget} from '../../connections/types'

function isDatabaseDriver(driver: Connection['driver']): driver is DatabaseDriver {
  return driver === 'postgres' || driver === 'mysql' || driver === 'mongodb' || driver === 'redis'
}

export function toWorkbenchTarget(connection: Connection): WorkbenchTarget {
  if (connection.kind !== 'database' || !isDatabaseDriver(connection.driver)) {
    throw new Error('数据库工作台仅支持数据库连接')
  }
  return {
    id: connection.id,
    name: connection.name,
    driver: connection.driver,
    scope: connection.scope,
    teamId: connection.teamId,
    host: connection.endpoint.host,
    port: connection.endpoint.port,
    database: connection.config.database ?? '',
    hasSecret: connection.hasSecret,
  }
}
