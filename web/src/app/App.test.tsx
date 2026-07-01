import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import { App, type WorkbenchAPI } from './App'

function fakeAPI(): WorkbenchAPI {
  return {
    createSession: vi.fn().mockResolvedValue('session'),
    connect: vi.fn().mockResolvedValue('connection'),
    disconnect: vi.fn().mockResolvedValue(undefined),
    metadata: vi.fn().mockResolvedValue([]),
    startQuery: vi.fn().mockResolvedValue('query-1'),
    queryResult: vi.fn().mockResolvedValue({queryId:'query-1', columns:[{name:'id'},{name:'name'}], rows:[[1,'Ada']], durationMs:4}),
    cancelQuery: vi.fn().mockResolvedValue(undefined),
    exportURL: vi.fn().mockReturnValue('/export.csv'),
    beginTransaction: vi.fn().mockResolvedValue('tx-1'),
    finishTransaction: vi.fn().mockResolvedValue(undefined),
    mutate: vi.fn().mockResolvedValue(undefined),
  }
}

it('executes SQL and renders returned rows', async () => {
  const api = fakeAPI()
  render(<App api={api} initialConnectionId="connection" initialSQL="SELECT id, name FROM people" />)
  await userEvent.click(screen.getByRole('button', {name:'执行 SQL'}))
  expect(await screen.findByRole('cell', {name:'Ada'})).toBeVisible()
  expect(api.startQuery).toHaveBeenCalledWith('connection', 'SELECT id, name FROM people', expect.anything())
})

it('requires object-name confirmation before DROP', async () => {
  const api = fakeAPI()
  render(<App api={api} initialConnectionId="connection" initialSQL="DROP TABLE invoices" />)
  await userEvent.click(screen.getByRole('button', {name:'执行 SQL'}))
  expect(screen.getByRole('dialog', {name:'确认危险操作'})).toBeVisible()
  expect(api.startQuery).not.toHaveBeenCalled()
})
