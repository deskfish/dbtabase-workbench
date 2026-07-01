import { render, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { TableView } from './TableView'

it('keeps a table without a unique key read-only', () => {
  render(<TableView schema="public" table="events" columns={[{name:'message', dataType:'text'}]} rows={[["hello"]]} uniqueKey={[]} onMutate={vi.fn()} />)
  expect(screen.getByText('此表没有主键或唯一键，仅支持只读浏览')).toBeVisible()
  expect(screen.queryByRole('button', {name:'编辑行'})).not.toBeInTheDocument()
})

it('offers editing when every key value is available', () => {
  render(<TableView schema="public" table="events" columns={[{name:'id', dataType:'integer'},{name:'message', dataType:'text'}]} rows={[[1,"hello"]]} uniqueKey={['id']} onMutate={vi.fn()} />)
  expect(screen.getByRole('button', {name:'编辑行'})).toBeVisible()
})
