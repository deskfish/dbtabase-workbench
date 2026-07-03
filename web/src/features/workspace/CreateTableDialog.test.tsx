import {render, screen} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {expect, it, vi} from 'vitest'
import {CreateTableDialog} from './CreateTableDialog'

it('creates a table with custom columns', async () => {
  const user = userEvent.setup()
  const onCreate = vi.fn()
  render(<CreateTableDialog database="app" driver="postgres" onCreate={onCreate} onClose={() => {}} />)

  await user.clear(screen.getByRole('textbox', {name: '表名'}))
  await user.type(screen.getByRole('textbox', {name: '表名'}), 'users')
  await user.type(screen.getByRole('textbox', {name: '备注 1'}), '主键')
  await user.click(screen.getByRole('button', {name: '创建表'}))

  expect(onCreate).toHaveBeenCalledWith('users', [{name: 'id', type: 'bigint', comment: '主键', primary: true}])
})

it('shows validation error for invalid table name', async () => {
  const user = userEvent.setup()
  render(<CreateTableDialog database="app" driver="mysql" onCreate={() => {}} onClose={() => {}} />)

  await user.clear(screen.getByRole('textbox', {name: '表名'}))
  await user.type(screen.getByRole('textbox', {name: '表名'}), '1bad')
  await user.click(screen.getByRole('button', {name: '创建表'}))

  expect(screen.getByText('表名仅支持字母、数字和下划线，且不能以数字开头')).toBeVisible()
})
