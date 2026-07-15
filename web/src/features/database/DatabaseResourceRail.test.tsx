import {render, screen} from '@testing-library/react'
import {MemoryRouter} from 'react-router-dom'
import {describe, expect, it, vi} from 'vitest'
import type {WorkbenchTarget} from '../../connections/types'
import {DatabaseResourceRail} from './DatabaseResourceRail'

const personal: WorkbenchTarget = {
  id: 'conn_personal', name: 'Primary', driver: 'postgres', scope: 'personal', host: 'db.internal', port: 5432, database: 'app', hasSecret: true,
}
const team: WorkbenchTarget = {
  id: 'conn_team', name: 'Team Analytics', driver: 'mysql', scope: 'team', teamId: 'team_one', host: 'analytics.internal', port: 3306, database: 'warehouse', hasSecret: true,
}

describe('DatabaseResourceRail', () => {
  it('shows personal and team v2 connections and routes management to Connection Center', () => {
    render(<MemoryRouter><DatabaseResourceRail connections={[personal, team]} selectedId="" connectingId="" connected={false} onSelect={vi.fn()} /></MemoryRouter>)

    expect(screen.getByRole('button', {name: '连接 Primary'})).toBeVisible()
    expect(screen.getByRole('button', {name: '连接 Team Analytics'})).toBeVisible()
    expect(screen.getByText('个人')).toBeVisible()
    expect(screen.getByText('团队')).toBeVisible()
    expect(screen.getByRole('link', {name: '管理连接'})).toHaveAttribute('href', '/connections')
    expect(screen.queryByRole('button', {name: '新建连接'})).not.toBeInTheDocument()
  })

  it('filters by name, host, database, and driver', async () => {
    const {user} = await import('@testing-library/user-event').then(({default: userEvent}) => ({user: userEvent.setup()}))
    render(<MemoryRouter><DatabaseResourceRail connections={[personal, team]} selectedId="" connectingId="" connected={false} onSelect={vi.fn()} /></MemoryRouter>)

    await user.type(screen.getByRole('searchbox', {name: '搜索数据库连接'}), 'warehouse')
    expect(screen.queryByRole('button', {name: '连接 Primary'})).not.toBeInTheDocument()
    expect(screen.getByRole('button', {name: '连接 Team Analytics'})).toBeVisible()
  })
})
