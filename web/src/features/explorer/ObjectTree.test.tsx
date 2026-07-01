import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import { ObjectTree } from './ObjectTree'

const objects = [
  {kind:'table' as const, schema:'public', name:'people'},
  {kind:'column' as const, schema:'public', parent:'people', name:'id', dataType:'integer'},
]

const handlers = {
  onOpenTable: vi.fn(),
  onNewQueryFromTable: vi.fn(),
  onCopyTableName: vi.fn(),
  onRefreshTable: vi.fn(),
  onCopyColumnName: vi.fn(),
  onNewQueryFromColumn: vi.fn(),
}

it('keeps columns collapsed by default and opens table on click', async () => {
  render(<ObjectTree objects={objects} {...handlers} />)
  expect(screen.getByRole('tree')).toBeVisible()
  expect(screen.getByRole('treeitem', {name:/people/})).toBeVisible()
  expect(screen.queryByText(/^id$/)).not.toBeInTheDocument()
  await userEvent.click(screen.getByRole('treeitem', {name:/people/}))
  expect(handlers.onOpenTable).toHaveBeenCalledWith(objects[0])
})

it('expands columns when the expand control is clicked', async () => {
  render(<ObjectTree objects={objects} {...handlers} />)
  await userEvent.click(screen.getByRole('button', {name:/展开 people 字段/}))
  expect(screen.getByText(/^id$/)).toBeVisible()
})

it('shows table context menu actions', async () => {
  render(<ObjectTree objects={objects} {...handlers} />)
  await userEvent.pointer({keys: '[MouseRight>]', target: screen.getByRole('treeitem', {name:/people/})})
  await userEvent.click(screen.getByRole('menuitem', {name:'新建查询'}))
  expect(handlers.onNewQueryFromTable).toHaveBeenCalledWith(objects[0])
})
