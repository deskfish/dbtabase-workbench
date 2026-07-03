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
  onOpenTableStructure: vi.fn(),
  onNewQuery: vi.fn(),
  onDeleteTable: vi.fn(),
}

it('opens table on click without showing columns', async () => {
  render(<ObjectTree objects={objects} {...handlers} />)
  expect(screen.getByRole('tree')).toBeVisible()
  expect(screen.getByRole('treeitem', {name:/people/})).toBeVisible()
  expect(screen.queryByText(/^id$/)).not.toBeInTheDocument()
  await userEvent.click(screen.getByRole('treeitem', {name:/people/}))
  expect(handlers.onOpenTable).toHaveBeenCalledWith(objects[0])
})

it('shows table context menu actions', async () => {
  render(<ObjectTree objects={objects} {...handlers} />)
  await userEvent.pointer({keys: '[MouseRight>]', target: screen.getByRole('treeitem', {name:/people/})})
  await userEvent.click(screen.getByRole('menuitem', {name:'打开表结构'}))
  expect(handlers.onOpenTableStructure).toHaveBeenCalledWith(objects[0])
})

it('opens a new query from context menu', async () => {
  render(<ObjectTree objects={objects} {...handlers} />)
  await userEvent.pointer({keys: '[MouseRight>]', target: screen.getByRole('treeitem', {name:/people/})})
  await userEvent.click(screen.getByRole('menuitem', {name:'新建查询'}))
  expect(handlers.onNewQuery).toHaveBeenCalledWith(objects[0])
})

it('supports delete table from context menu', async () => {
  render(<ObjectTree objects={objects} {...handlers} />)
  await userEvent.pointer({keys: '[MouseRight>]', target: screen.getByRole('treeitem', {name:/people/})})
  await userEvent.click(screen.getByRole('menuitem', {name:'删除表'}))
  expect(handlers.onDeleteTable).toHaveBeenCalledWith(objects[0])
})
