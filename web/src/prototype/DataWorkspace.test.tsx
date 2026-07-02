import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { dataColumns, dataRows } from './fixtures'
import { DataWorkspace } from './components/DataWorkspace'

describe('prototype data workspace', () => {
  it('keeps table identity, filters, density, and grid in distinct states', async () => {
    const user = userEvent.setup()
    render(<DataWorkspace
      table="conversation_record"
      columns={dataColumns}
      rows={dataRows}
      activeSection="data"
      onSectionChange={() => {}}
    />)

    expect(screen.getByText('public.conversation_record')).toBeVisible()
    expect(screen.getByText('12,568 行')).toBeVisible()
    await user.click(screen.getByRole('button', {name:'WHERE 条件'}))
    expect(screen.getByLabelText('筛选字段')).toBeVisible()
    await user.click(screen.getByRole('button', {name:'切换为紧凑密度'}))
    expect(screen.getByRole('grid')).toHaveAttribute('data-density','compact')
  })
})
