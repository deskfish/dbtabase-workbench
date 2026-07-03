import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import { TableFilterBuilder } from './TableFilterBuilder'
import { createEmptyFilterRule } from './tableViewState'

it('renders editable rows with apply and clear actions', async () => {
  const onApply = vi.fn()
  const onClear = vi.fn()
  render(<TableFilterBuilder
    columns={[{name: 'id'}, {name: 'name'}]}
    rules={[{...createEmptyFilterRule('id'), value: '2'}]}
    onApply={onApply}
    onClear={onClear}
  />)
  expect(screen.getByDisplayValue('2')).toBeVisible()
  expect(screen.getByRole('button', {name: '应用筛选'})).toBeVisible()
  await userEvent.click(screen.getByRole('button', {name: '应用筛选'}))
  expect(onApply).toHaveBeenCalled()
})

it('allows switching join operator between rows', async () => {
  render(<TableFilterBuilder
    columns={[{name: 'id'}, {name: 'name'}]}
    rules={[createEmptyFilterRule('id'), createEmptyFilterRule('name')]}
    onApply={() => {}}
    onClear={() => {}}
  />)
  const joinBtn = screen.getByRole('button', {name: 'Join with next: and'})
  expect(joinBtn).toHaveTextContent('and')
  await userEvent.click(joinBtn)
  expect(screen.getByRole('button', {name: 'Join with next: or'})).toHaveTextContent('or')
})
