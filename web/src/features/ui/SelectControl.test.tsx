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

it('supports keyboard navigation and selection', async () => {
  const onChange = vi.fn()
  render(<SelectControl
    ariaLabel="字段"
    value="id"
    options={[{value: 'id', label: 'id'}, {value: 'session_id', label: 'session_id'}]}
    onChange={onChange}
  />)

  const trigger = screen.getByRole('combobox', {name: '字段'})
  trigger.focus()
  await userEvent.keyboard('{ArrowDown}{ArrowDown}{Enter}')

  expect(onChange).toHaveBeenCalledWith('session_id')
  expect(screen.queryByRole('listbox', {name: '字段'})).not.toBeInTheDocument()
  expect(trigger).toHaveFocus()
})

it('closes with Escape without changing the value', async () => {
  const onChange = vi.fn()
  render(<SelectControl
    ariaLabel="字段"
    value="id"
    options={[{value: 'id', label: 'id'}, {value: 'session_id', label: 'session_id'}]}
    onChange={onChange}
  />)

  const trigger = screen.getByRole('combobox', {name: '字段'})
  await userEvent.click(trigger)
  await userEvent.keyboard('{Escape}')

  expect(screen.queryByRole('listbox', {name: '字段'})).not.toBeInTheDocument()
  expect(onChange).not.toHaveBeenCalled()
  expect(trigger).toHaveFocus()
})

it('does not open while disabled', async () => {
  render(<SelectControl
    ariaLabel="数据库"
    value="main"
    options={[{value: 'main', label: 'main'}]}
    onChange={() => {}}
    disabled
  />)

  const trigger = screen.getByRole('combobox', {name: '数据库'})
  expect(trigger).toBeDisabled()
  await userEvent.click(trigger)
  expect(screen.queryByRole('listbox', {name: '数据库'})).not.toBeInTheDocument()
})
