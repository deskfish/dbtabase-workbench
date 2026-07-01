import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import { ConnectionDialog } from './ConnectionDialog'

it('submits a MySQL connection with its default port', async () => {
  const onConnect = vi.fn().mockResolvedValue(undefined)
  render(<ConnectionDialog onCancel={() => {}} onConnect={onConnect} />)
  await userEvent.type(screen.getByLabelText('连接名称'), 'Orders')
  await userEvent.type(screen.getByLabelText('主机'), 'db.internal')
  await userEvent.type(screen.getByLabelText('用户名'), 'analyst')
  await userEvent.type(screen.getByLabelText('数据库密码'), 'secret')
  await userEvent.click(screen.getByRole('button', {name:'连接数据库'}))
  expect(onConnect).toHaveBeenCalledWith(expect.objectContaining({driver:'mysql', port:3306, host:'db.internal'}), expect.objectContaining({name:'Orders'}))
})
