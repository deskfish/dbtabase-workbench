import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import { ConnectionDialog } from './ConnectionDialog'

it('submits a Redis connection with password', async () => {
  const onConnect = vi.fn().mockResolvedValue(undefined)
  render(<ConnectionDialog onCancel={() => {}} onConnect={onConnect} />)
  await userEvent.click(screen.getByLabelText('数据库类型'))
  await userEvent.click(screen.getByRole('option', {name: 'Redis'}))
  fireEvent.change(screen.getByLabelText('连接名称'), {target: {value: 'Redis Prod'}})
  fireEvent.change(screen.getByLabelText('主机'), {target: {value: '192.168.6.100'}})
  await userEvent.type(screen.getByLabelText('密码'), 'redis')
  await userEvent.click(screen.getByRole('button', {name:'连接数据库'}))
  expect(onConnect).toHaveBeenCalledWith(expect.objectContaining({
    driver: 'redis',
    port: 6379,
    host: '192.168.6.100',
    password: 'redis',
    database: '0',
  }), expect.objectContaining({name: 'Redis Prod'}))
})

it('submits a MySQL connection with its default port', async () => {
  const onConnect = vi.fn().mockResolvedValue(undefined)
  render(<ConnectionDialog onCancel={() => {}} onConnect={onConnect} />)
  fireEvent.change(screen.getByLabelText('连接名称'), {target: {value: 'Orders'}})
  fireEvent.change(screen.getByLabelText('主机'), {target: {value: 'db.internal'}})
  fireEvent.change(screen.getByLabelText('数据库'), {target: {value: 'app'}})
  await userEvent.type(screen.getByLabelText('用户名'), 'analyst')
  await userEvent.type(screen.getByLabelText('数据库密码'), 'secret')
  await userEvent.click(screen.getByRole('button', {name:'连接数据库'}))
  expect(onConnect).toHaveBeenCalledWith(expect.objectContaining({driver:'mysql', port:3306, host:'db.internal', database:'app'}), expect.objectContaining({name:'Orders'}))
})

it('shows driver-specific validation before connecting', async () => {
  const onConnect = vi.fn().mockResolvedValue(undefined)
  render(<ConnectionDialog onCancel={() => {}} onConnect={onConnect} />)
  fireEvent.change(screen.getByLabelText('连接名称'), {target: {value: 'Orders'}})
  fireEvent.change(screen.getByLabelText('主机'), {target: {value: 'db.internal'}})
  await userEvent.click(screen.getByRole('button', {name:'连接数据库'}))
  expect(screen.getByRole('alert')).toHaveTextContent('请输入数据库')
  expect(onConnect).not.toHaveBeenCalled()
})
