import { expect, it } from 'vitest'
import { buildRowUpdate } from './tableMutations'

it('builds update sql payload without touching primary key', () => {
  const columns = [
    {name: 'id', dataType: 'bigint'},
    {name: 'channel_name', dataType: 'character varying'},
  ]
  const payload = buildRowUpdate(
    columns,
    [100, 'old-name'],
    {id: '100', channel_name: 'new-name'},
    ['id'],
  )
  expect(payload).toEqual({
    key: {id: 100},
    values: {channel_name: 'new-name'},
  })
})
