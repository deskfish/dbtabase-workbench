import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import { SelectControl } from './SelectControl'

it('opens a consistent listbox and selects an option', async () => {
  const onChange = vi.fn()
  render(<SelectControl
    ariaLabel="运算符"
    value="eq"
    options={[{value: 'eq', label: '等于'}, {value: 'gt', label: '大于'}]}
    onChange={onChange}
  />)

  await userEvent.click(screen.getByRole('combobox', {name: '运算符'}))
  expect(screen.getByRole('listbox', {name: '运算符'})).toBeVisible()
  await userEvent.click(screen.getByRole('option', {name: '大于'}))
  expect(onChange).toHaveBeenCalledWith('gt')
})
