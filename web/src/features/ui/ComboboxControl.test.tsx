import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import { ComboboxControl } from './ComboboxControl'

const options = [
  {value: 'bigint', label: 'bigint'},
  {value: 'character varying', label: 'character varying'},
  {value: 'timestamp without time zone', label: 'timestamp without time zone'},
]

it('filters options while typing and keeps free text', async () => {
  const onChange = vi.fn()
  render(<ComboboxControl ariaLabel="数据类型" value="bigint" options={options} onChange={onChange} />)

  const input = screen.getByRole('combobox', {name: '数据类型'})
  await userEvent.clear(input)
  await userEvent.type(input, 'char')

  expect(onChange).toHaveBeenLastCalledWith('char')
  expect(screen.getByRole('listbox', {name: '数据类型'})).toBeVisible()
  expect(screen.getByRole('option', {name: 'character varying'})).toBeVisible()
  expect(screen.queryByRole('option', {name: 'bigint'})).not.toBeInTheDocument()
})

it('shows all options when the toggle is clicked', async () => {
  render(<ComboboxControl ariaLabel="数据类型" value="integer" options={options} onChange={() => {}} />)

  await userEvent.click(screen.getByRole('button', {name: '数据类型 选项'}))
  expect(screen.getByRole('listbox', {name: '数据类型'})).toBeVisible()
  expect(screen.getByRole('option', {name: 'bigint'})).toBeVisible()
  expect(screen.getByRole('option', {name: 'timestamp without time zone'})).toBeVisible()
})

it('selects an option from the filtered list', async () => {
  const onChange = vi.fn()
  render(<ComboboxControl ariaLabel="数据类型" value="" options={options} onChange={onChange} />)

  const input = screen.getByRole('combobox', {name: '数据类型'})
  await userEvent.type(input, 'time')
  await userEvent.click(screen.getByRole('option', {name: 'timestamp without time zone'}))

  expect(onChange).toHaveBeenLastCalledWith('timestamp without time zone')
  expect(input).toHaveValue('timestamp without time zone')
})
