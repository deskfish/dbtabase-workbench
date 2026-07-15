import {render, screen} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {describe, expect, it, vi} from 'vitest'
import {EmptyState} from './EmptyState'
import {StatusBadge} from './StatusBadge'
import {WorkbenchContent, WorkbenchFrame, WorkbenchPaneToolbar, WorkbenchSidebar} from './WorkbenchFrame'

describe('WorkbenchFrame', () => {
  it('labels the pane toolbar, sidebar, and workspace regions', () => {
    render(
      <WorkbenchFrame sidebarOpen={false} onSidebarOpenChange={() => undefined}>
        <WorkbenchSidebar label="日志会话">sessions</WorkbenchSidebar>
        <WorkbenchContent label="日志工作台工作区">
          <WorkbenchPaneToolbar>
            <button type="button">新建</button>
          </WorkbenchPaneToolbar>
          workspace
        </WorkbenchContent>
      </WorkbenchFrame>,
    )

    expect(screen.getByRole('complementary', {name: '日志会话'})).toBeInTheDocument()
    expect(screen.getByRole('main', {name: '日志工作台工作区'})).toBeInTheDocument()
    expect(screen.getByRole('button', {name: '新建'})).toBeInTheDocument()
  })

  it('opens and closes the responsive sidebar', async () => {
    const user = userEvent.setup()
    const onSidebarOpenChange = vi.fn()
    render(
      <WorkbenchFrame sidebarOpen onSidebarOpenChange={onSidebarOpenChange}>
        <WorkbenchSidebar label="连接筛选">filters</WorkbenchSidebar>
        <WorkbenchContent label="连接列表">
          <WorkbenchPaneToolbar onOpenSidebar={() => onSidebarOpenChange(true)} />
          connections
        </WorkbenchContent>
      </WorkbenchFrame>,
    )

    await user.click(screen.getByRole('button', {name: '关闭侧栏'}))
    expect(onSidebarOpenChange).toHaveBeenCalledWith(false)
    await user.click(screen.getByRole('button', {name: '打开侧栏'}))
    expect(onSidebarOpenChange).toHaveBeenCalledWith(true)
  })

  it('renders shared empty and status feedback', () => {
    render(<><StatusBadge tone="success">已连接</StatusBadge><EmptyState title="暂无数据" description="先创建一条记录" /></>)
    expect(screen.getByText('已连接')).toHaveAttribute('data-tone', 'success')
    expect(screen.getByRole('status', {name: '暂无数据'})).toHaveTextContent('先创建一条记录')
  })
})
