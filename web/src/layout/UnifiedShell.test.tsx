import {render, screen, within} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {expect, it} from 'vitest'
import {MemoryRouter} from 'react-router-dom'
import {AuthProvider} from '../auth/AuthProvider'
import type {AuthSession} from '../auth/types'
import {UnifiedShell} from './UnifiedShell'
import {useUnifiedContext, useUnifiedRuntime, useUnifiedSidebar, useUnifiedStatus} from './UnifiedShellContext'

const session: AuthSession = {
  user: {id: 'usr_admin', username: 'admin', displayName: 'Admin', systemRole: 'admin'},
  teams: [],
  csrfToken: 'csrf-test',
}

function ContextFixture() {
  useUnifiedSidebar(<button type="button">上下文操作</button>, {label: '测试上下文'})
  useUnifiedContext(<p>连接延迟 18ms</p>, {label: '连接上下文'})
  useUnifiedRuntime({path: ['production', 'connections'], detail: '控制平面正常'}, [])
  useUnifiedStatus('已同步 4 个连接', [])
  return <main aria-label="测试工作区">内容</main>
}

function renderShell() {
  return render(
    <MemoryRouter initialEntries={['/connections']}>
      <AuthProvider initialSession={session}>
        <UnifiedShell><ContextFixture /></UnifiedShell>
      </AuthProvider>
    </MemoryRouter>,
  )
}

function renderShellWithoutContext() {
  return render(
    <MemoryRouter initialEntries={['/connections']}>
      <AuthProvider initialSession={session}>
        <UnifiedShell><main aria-label="空工作区">内容</main></UnifiedShell>
      </AuthProvider>
    </MemoryRouter>,
  )
}

it('opens the complete navigation in an accessible mobile drawer and closes it with Escape', async () => {
  const user = userEvent.setup()
  renderShell()

  const trigger = screen.getByRole('button', {name: '打开导航'})
  await user.click(trigger)
  const drawer = screen.getByRole('dialog', {name: '产品导航'})
  expect(drawer).toBeVisible()
  expect(within(drawer).getByRole('link', {name: '设置'})).toBeVisible()
  expect(within(drawer).getByRole('button', {name: '上下文操作'})).toBeVisible()

  await user.keyboard('{Escape}')
  expect(screen.queryByRole('dialog', {name: '产品导航'})).not.toBeInTheDocument()
  expect(trigger).toHaveFocus()
})

it('groups product navigation and exposes the current route in the resource rail', () => {
  renderShell()
  const resources = screen.getByRole('navigation', {name: '资源'})
  expect(within(resources).getByRole('link', {name: '连接中心'})).toHaveAttribute('aria-current', 'page')
  expect(within(resources).getByRole('link', {name: '设置'})).toBeVisible()
})

it('composes resources, work, context, runtime, and status as one terminal', () => {
  renderShell()
  expect(document.querySelector('.unified-shell')).toHaveAttribute('data-has-context', 'true')
  expect(screen.getByRole('navigation', {name: '资源'})).toHaveTextContent('上下文操作')
  expect(screen.getByRole('complementary', {name: '连接上下文'})).toHaveTextContent('连接延迟 18ms')
  expect(screen.getAllByRole('banner')[0]).toHaveTextContent('production / connections')
  expect(screen.getByRole('status')).toHaveTextContent('已同步 4 个连接')
})

it('marks an empty context rail so the desktop workspace can reclaim the column', () => {
  renderShellWithoutContext()
  expect(document.querySelector('.unified-shell')).toHaveAttribute('data-has-context', 'false')
  expect(screen.queryByRole('button', {name: '上下文'})).not.toBeInTheDocument()
})
