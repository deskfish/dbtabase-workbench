import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { PrototypeApp } from './PrototypeApp'

describe('prototype workspace modes', () => {
  it('edits a field and previews its DDL', async () => {
    const user=userEvent.setup()
    render(<PrototypeApp/>)

    await user.click(screen.getByRole('tab',{name:'字段结构'}))
    const input=screen.getByLabelText('字段 created_time 默认值')
    await user.clear(input)
    await user.type(input,'now()')

    expect(screen.getByText('有 1 项未保存修改')).toBeVisible()
    expect(screen.getByText(/ALTER COLUMN created_time/)).toBeVisible()
  })

  it('switches to SQL query and reports a successful run', async () => {
    const user=userEvent.setup()
    render(<PrototypeApp/>)

    await user.click(screen.getByRole('tab',{name:'query_01'}))
    await user.click(screen.getByRole('button',{name:'运行查询'}))
    expect(await screen.findByText('查询成功')).toBeVisible()
  })
})
