import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { teamConnections } from './fixtures'
import { TeamConnectionsDialog } from './components/TeamConnectionsDialog'

describe('prototype team connections dialog', () => {
  it('selects available rows and copies them as a batch', async () => {
    const user=userEvent.setup()
    const onCopy=vi.fn()
    render(<TeamConnectionsDialog connections={teamConnections} onCopy={onCopy} onClose={()=>{}}/>)

    await user.click(screen.getByRole('checkbox',{name:'选择 10.10.80.122_pg'}))
    await user.click(screen.getByRole('checkbox',{name:'选择 192.168.6.100'}))
    await user.click(screen.getByRole('button',{name:'复制选中（2）'}))
    expect(onCopy).toHaveBeenCalledWith(['conn-1','conn-2'])
  })

  it('disables rows that already exist in personal connections', () => {
    render(<TeamConnectionsDialog connections={teamConnections} onCopy={()=>{}} onClose={()=>{}}/>)
    expect(screen.getByRole('checkbox',{name:'选择 192.168.6.105'})).toBeDisabled()
    expect(screen.getByText('已在个人')).toBeVisible()
  })
})
