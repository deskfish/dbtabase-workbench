import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { PrototypeApp } from './PrototypeApp'

describe('PrototypeApp shell', () => {
  it('renders the product, navigation columns, and primary workspace', () => {
    render(<PrototypeApp />)

    expect(screen.getByText('数据库管理')).toBeVisible()
    expect(screen.getByLabelText('个人连接')).toBeVisible()
    expect(screen.getByLabelText('数据库对象')).toBeVisible()
    expect(screen.getByRole('main', {name: '数据库工作区'})).toBeVisible()
  })
})
