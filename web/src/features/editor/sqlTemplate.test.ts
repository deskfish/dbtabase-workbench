import {expect,it} from 'vitest'
import {SQL_GUIDE,isSqlGuide,sqlForSelectedTable} from './sqlTemplate'

it('uses a comment-only SQL guide',()=>{
  expect(SQL_GUIDE).toBe('-- 从左侧选择一张表，或在这里输入 SQL')
  expect(isSqlGuide(SQL_GUIDE)).toBe(true)
})

it('replaces only the untouched guide',()=>{
  const generated='SELECT *\nFROM public.people\nLIMIT 200;'
  expect(sqlForSelectedTable(SQL_GUIDE,generated)).toBe(generated)
  expect(sqlForSelectedTable('SELECT now();',generated)).toBe('SELECT now();')
})
