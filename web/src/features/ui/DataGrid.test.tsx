import {render, screen} from '@testing-library/react'
import {describe, expect, it} from 'vitest'
import {DataGrid} from './DataGrid'
import {TextAreaField} from './TextAreaField'
import {TextField} from './TextField'

describe('DataGrid', () => {
  it('renders loading and empty states without an empty table', () => {
    const {rerender} = render(<DataGrid label="连接列表" loading empty="暂无连接"><tbody /></DataGrid>)
    expect(screen.getByRole('status')).toHaveTextContent('正在加载')

    rerender(<DataGrid label="连接列表" loading={false} empty="暂无连接"><tbody /></DataGrid>)
    expect(screen.getByText('暂无连接')).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('renders semantic table content', () => {
    render(<DataGrid label="连接列表" loading={false}><tbody><tr><td>main-db</td></tr></tbody></DataGrid>)
    expect(screen.getByRole('table', {name: '连接列表'})).toBeInTheDocument()
    expect(screen.getByRole('cell', {name: 'main-db'})).toBeInTheDocument()
  })
})

describe('shared fields', () => {
  it('connects hints and errors to text controls', () => {
    render(<><TextField label="名称" hint="用于列表展示" /><TextAreaField label="私钥" error="请输入私钥" /></>)
    expect(screen.getByLabelText('名称')).toHaveAccessibleDescription('用于列表展示')
    expect(screen.getByLabelText('私钥')).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByLabelText('私钥')).toHaveAccessibleDescription('请输入私钥')
  })
})
