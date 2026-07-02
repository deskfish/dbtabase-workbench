import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { personalConnections } from './fixtures'
import { ConnectionSidebar } from './components/ConnectionSidebar'

describe('prototype connection sidebar', () => {
  it('selects and filters full connection rows', async () => {
    const user = userEvent.setup()
    const onSelect = vi.fn()
    render(<ConnectionSidebar
      connections={personalConnections}
      selectedId="conn-1"
      teamCount={6}
      onSelect={onSelect}
      onOpenTeam={() => {}}
      onNew={() => {}}
      onEdit={() => {}}
      onDelete={() => {}}
      onShare={() => {}}
    />)

    expect(screen.getByText('连接：个人连接')).toBeVisible()
    expect(screen.getByText('10.10.80.122_pg')).toBeVisible()
    expect(screen.getByText('flybase')).toBeVisible()
    expect(screen.getByText('已连接')).toBeVisible()

    await user.click(screen.getByRole('button', {name:'连接 192.168.6.100'}))
    expect(onSelect).toHaveBeenCalledWith('conn-2')

    await user.type(screen.getByRole('searchbox', {name:'搜索个人连接'}), '10.10')
    expect(screen.getByText('10.10.80.122_pg')).toBeVisible()
    expect(screen.queryByText('192.168.6.100')).not.toBeInTheDocument()
  })

  it('exposes team and selected-connection actions', async () => {
    const user = userEvent.setup()
    const onOpenTeam = vi.fn()
    const onShare = vi.fn()
    render(<ConnectionSidebar
      connections={personalConnections}
      selectedId="conn-1"
      teamCount={6}
      onSelect={() => {}}
      onOpenTeam={onOpenTeam}
      onNew={() => {}}
      onEdit={() => {}}
      onDelete={() => {}}
      onShare={onShare}
    />)

    await user.click(screen.getByRole('button', {name:'浏览团队连接'}))
    expect(onOpenTeam).toHaveBeenCalledOnce()
    expect(screen.getByRole('button', {name:'分享当前连接'})).toBeDisabled()
  })
})
