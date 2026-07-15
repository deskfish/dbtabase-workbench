import {render, screen} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {expect, it} from 'vitest'
import {MemoryRouter, useLocation} from 'react-router-dom'
import {CommandBar} from './CommandBar'
import {UnifiedShellProvider} from './UnifiedShellContext'

function LocationProbe() {
  return <output aria-label="当前路径">{useLocation().pathname}</output>
}

it('focuses with the command shortcut and navigates through a matching module command', async () => {
  const user = userEvent.setup()
  render(
    <MemoryRouter initialEntries={['/connections']}>
      <UnifiedShellProvider>
        <CommandBar />
        <LocationProbe />
      </UnifiedShellProvider>
    </MemoryRouter>,
  )

  expect(screen.getByRole('search', {name: '命令搜索'})).toBeInTheDocument()
  const input = screen.getByRole('searchbox', {name: '搜索连接、表或命令'})
  expect(input).toHaveAttribute('aria-keyshortcuts', 'Meta+K Control+K')
  await user.keyboard('{Meta>}k{/Meta}')
  expect(input).toHaveFocus()
  await user.type(input, '日志')
  await user.click(screen.getByRole('button', {name: '前往 日志'}))
  expect(screen.getByRole('status', {name: '已导航到 日志'})).toBeVisible()
  expect(screen.getByRole('status', {name: '已导航到 日志'})).toHaveTextContent('已打开 日志')
  expect(screen.getByLabelText('当前路径')).toHaveTextContent('/logs')
})
