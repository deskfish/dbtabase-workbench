import {render, screen} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {expect, it, vi} from 'vitest'
import {TerminalCommandFilter, TerminalInlineAction, TerminalStatus} from './TerminalPrimitives'

it('renders explicit status text with its semantic tone', () => {
  render(<TerminalStatus tone="success">正常</TerminalStatus>)

  expect(screen.getByText('正常')).toHaveAttribute('data-tone', 'success')
})

it('exposes a command filter with active condition tokens', async () => {
  const onChange = vi.fn()
  render(<TerminalCommandFilter aria-label="筛选连接" value="" placeholder="名称 / 主机 / 驱动" tokens={['类型：全部', '范围：团队']} onChange={onChange} />)

  await userEvent.type(screen.getByRole('searchbox', {name: '筛选连接'}), 'mysql')

  expect(onChange).toHaveBeenCalled()
  expect(screen.getByText('类型：全部')).toBeVisible()
  expect(screen.getByText('范围：团队')).toBeVisible()
})

it('keeps destructive inline actions semantically distinct', async () => {
  const onClick = vi.fn()
  render(<TerminalInlineAction tone="danger" onClick={onClick}>删除</TerminalInlineAction>)

  const action = screen.getByRole('button', {name: '删除'})
  expect(action).toHaveAttribute('data-tone', 'danger')
  await userEvent.click(action)
  expect(onClick).toHaveBeenCalledOnce()
})
