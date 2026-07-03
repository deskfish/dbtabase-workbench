import {expect, it} from 'vitest'
import {appendAddIndex, dropIndexOps, replaceIndex, resolveIndexes} from './indexOps'
import type {SchemaIndex} from '../../api/types'

const base: SchemaIndex[] = [
  {name: 'idx_old', columns: ['a'], unique: false},
  {name: 'idx_keep', columns: ['b'], unique: true},
]

it('merges pending index changes', () => {
  const extra = [
    {kind: 'drop_index', name: 'idx_old'},
    {kind: 'add_index', index: {name: 'idx_new', columns: ['c'], unique: false}},
  ]
  expect(resolveIndexes(base, extra).map((item) => item.name)).toEqual(['idx_keep', 'idx_new'])
})

it('replaces pending add without drop', () => {
  const extra = appendAddIndex([], {name: 'idx_new', columns: ['c'], unique: false})
  const next = replaceIndex(extra, base, 'idx_new', {name: 'idx_renamed', columns: ['d'], unique: true})
  expect(next).toEqual([{kind: 'add_index', index: {name: 'idx_renamed', columns: ['d'], unique: true}}])
})

it('drops base index when editing persisted index', () => {
  const next = replaceIndex([], base, 'idx_old', {name: 'idx_old', columns: ['a', 'b'], unique: false})
  expect(next).toEqual([
    {kind: 'drop_index', name: 'idx_old'},
    {kind: 'add_index', index: {name: 'idx_old', columns: ['a', 'b'], unique: false}},
  ])
})

it('drops persisted index and cancels pending add', () => {
  const extra = appendAddIndex([], {name: 'idx_new', columns: ['c'], unique: false})
  expect(dropIndexOps(extra, base, 'idx_old')).toEqual([
    {kind: 'add_index', index: {name: 'idx_new', columns: ['c'], unique: false}},
    {kind: 'drop_index', name: 'idx_old'},
  ])
  expect(dropIndexOps(extra, base, 'idx_new')).toEqual([])
})
