import {render, screen} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {describe, expect, it, vi} from 'vitest'
import {WorkspaceTabs} from './WorkspaceTabs'

describe('WorkspaceTabs', () => {
  it('reports the selected tab and changes it on click', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(
      <WorkspaceTabs
        ariaLabel="日志工具"
        value="search"
        onChange={onChange}
        tabs={[
          {value: 'search', label: '日志检索'},
          {value: 'tail', label: '实时 Tail'},
        ]}
      />,
    )

    expect(screen.getByRole('tab', {name: '日志检索'})).toHaveAttribute('aria-selected', 'true')
    await user.click(screen.getByRole('tab', {name: '实时 Tail'}))
    expect(onChange).toHaveBeenCalledWith('tail')
  })

  it('moves between enabled tabs with arrow keys', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(
      <WorkspaceTabs
        ariaLabel="日志工具"
        value="search"
        onChange={onChange}
        tabs={[
          {value: 'search', label: '日志检索'},
          {value: 'upload', label: '本地导入', disabled: true},
          {value: 'tail', label: '实时 Tail'},
        ]}
      />,
    )

    const selected = screen.getByRole('tab', {name: '日志检索'})
    selected.focus()
    await user.keyboard('{ArrowRight}')
    expect(onChange).toHaveBeenCalledWith('tail')
  })
})
