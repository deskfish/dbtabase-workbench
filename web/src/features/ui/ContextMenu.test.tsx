import {render, screen} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {describe, expect, it, vi} from 'vitest'
import {ContextMenu} from './ContextMenu'

describe('ContextMenu', () => {
  it('focuses the first enabled item and supports arrow navigation', async () => {
    const user = userEvent.setup()
    render(<ContextMenu x={10} y={10} ariaLabel="连接操作" items={[
      {label: '编辑', disabled: true},
      {label: '复制'},
      {label: '删除'},
    ]} onClose={() => undefined} />)
    expect(screen.getByRole('menu', {name: '连接操作'})).toBeInTheDocument()
    expect(screen.getByRole('menuitem', {name: '复制'})).toHaveFocus()
    await user.keyboard('{ArrowDown}')
    expect(screen.getByRole('menuitem', {name: '删除'})).toHaveFocus()
  })

  it('closes on escape', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(<ContextMenu x={10} y={10} items={[{label: '编辑'}]} onClose={onClose} />)
    await user.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledOnce()
  })
})
