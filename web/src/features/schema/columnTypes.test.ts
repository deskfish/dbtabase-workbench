import { expect, it } from 'vitest'
import { buildColumnTypeOptions, defaultColumnType } from './columnTypes'

it('merges existing column types with postgres presets', () => {
  const options = buildColumnTypeOptions('postgres', ['custom_enum'])
  expect(options.map((item) => item.value)).toContain('custom_enum')
  expect(options.map((item) => item.value)).toContain('character varying')
})

it('uses driver-specific defaults for new columns', () => {
  expect(defaultColumnType('postgres')).toBe('character varying(255)')
  expect(defaultColumnType('mysql')).toBe('varchar(255)')
})
