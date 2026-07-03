import {expect,it} from 'vitest'
import {diffColumns} from './schemaDraft'
it('creates structured add alter rename and drop operations', () => {
  const before = [{name: 'id', type: 'int', nullable: false}, {name: 'old', type: 'text', nullable: true}]
  const after = [
    {name: 'id', type: 'bigint', nullable: false},
    {name: 'new', originalName: 'old', type: 'text', nullable: true},
    {name: 'title', type: 'varchar(50)', nullable: true, isNew: true},
  ]
  expect(diffColumns(before, after).map((item) => item.kind)).toEqual(['alter_column', 'rename_column', 'add_column'])
})

it('creates comment update operations', () => {
  const before = [{name: 'id', type: 'int', nullable: false, comment: ''}]
  const after = [{name: 'id', type: 'int', nullable: false, comment: '主键'}]
  expect(diffColumns(before, after)).toEqual([{kind: 'set_column_comment', column: {name: 'id', type: 'int', nullable: false, comment: '主键'}}])
})

it('creates primary key change operations', () => {
  const before = [{name: 'id', type: 'bigint', nullable: false, primary: true}, {name: 'code', type: 'varchar(32)', nullable: false}]
  const after = [{name: 'id', type: 'bigint', nullable: false}, {name: 'code', type: 'varchar(32)', nullable: false, primary: true}]
  expect(diffColumns(before, after)).toEqual([{kind: 'set_primary', name: 'code'}])
})
