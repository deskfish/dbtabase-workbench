/** PostgreSQL 常用字段类型 */
export const POSTGRES_COLUMN_TYPES = [
  'smallint',
  'integer',
  'bigint',
  'numeric',
  'numeric(10,2)',
  'real',
  'double precision',
  'smallserial',
  'serial',
  'bigserial',
  'character varying',
  'character varying(255)',
  'varchar',
  'varchar(255)',
  'character',
  'character(1)',
  'char',
  'text',
  'boolean',
  'date',
  'time',
  'time without time zone',
  'timestamp',
  'timestamp without time zone',
  'timestamp with time zone',
  'timestamptz',
  'json',
  'jsonb',
  'uuid',
  'bytea',
  'inet',
  'cidr',
]

/** MySQL 常用字段类型 */
export const MYSQL_COLUMN_TYPES = [
  'tinyint',
  'smallint',
  'mediumint',
  'int',
  'bigint',
  'decimal',
  'decimal(10,2)',
  'float',
  'double',
  'char',
  'char(1)',
  'varchar',
  'varchar(255)',
  'text',
  'mediumtext',
  'longtext',
  'binary',
  'varbinary',
  'blob',
  'mediumblob',
  'longblob',
  'date',
  'datetime',
  'timestamp',
  'time',
  'year',
  'json',
  'boolean',
  'bool',
  'uuid',
]

export function buildColumnTypeOptions(driver: 'mysql' | 'postgres', existingTypes: string[]) {
  const preset = driver === 'mysql' ? MYSQL_COLUMN_TYPES : POSTGRES_COLUMN_TYPES
  const merged = [...new Set([...existingTypes.filter(Boolean), ...preset])]
  return merged.map((type) => ({value: type, label: type}))
}

export function defaultColumnType(driver: 'mysql' | 'postgres') {
  return driver === 'mysql' ? 'varchar(255)' : 'character varying(255)'
}
