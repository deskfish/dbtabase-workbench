import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import { TableView } from './TableView'

const columns = [{name: 'id', dataType: 'integer'}, {name: 'message', dataType: 'text'}]

function renderTable(overrides: Partial<Parameters<typeof TableView>[0]> = {}) {
  return render(<TableView
    schema="public"
    table="events"
    columns={columns}
    rows={[[1, 'hello']]}
    uniqueKey={[]}
    sql="SELECT * FROM public.events LIMIT 200;"
    status="idle"
    message="1 行"
    page={1}
    pageSize={200}
    filterRules={[]}
    sort={null}
    showFilter={false}
    selectedRow={null}
    draft={null}
    onSelectRow={vi.fn()}
    onPageChange={vi.fn()}
    onPageSizeChange={vi.fn()}
    onFiltersApply={vi.fn()}
    onFiltersClear={vi.fn()}
    onSortChange={vi.fn()}
    onToggleFilter={vi.fn()}
    onRefresh={vi.fn()}
    onStop={vi.fn()}
    onDraftChange={vi.fn()}
    onApply={vi.fn(async () => {})}
    onDiscard={vi.fn()}
    onExport={vi.fn()}
    onSaveError={vi.fn()}
    onMutate={vi.fn(async () => {})}
    {...overrides}
  />)
}

it('keeps a table without a unique key read-only', () => {
  renderTable()
  expect(screen.getByText('此表没有主键或唯一键，仅支持只读浏览与筛选排序')).toBeVisible()
  expect(screen.getByRole('button', {name: '新增行'})).toBeDisabled()
})

it('shows navicat style row tools when editable', () => {
  renderTable({uniqueKey: ['id']})
  expect(screen.getByRole('button', {name: '新增行'})).toBeEnabled()
  expect(screen.getByRole('button', {name: '新增行'})).toHaveTextContent('新增')
  expect(screen.getByRole('button', {name: '刷新'})).toHaveTextContent('刷新')
  expect(screen.getByRole('columnheader', {name:'#'})).toHaveClass('sticky-row-number')
  expect(screen.getByRole('columnheader', {name:/id/i})).toHaveClass('sticky-key-column')
  expect(screen.getByRole('button', {name: '应用修改'})).toBeDisabled()
  expect(screen.getByText(/SELECT \* FROM public.events/i)).toBeVisible()
})

it('opens column sort menu on header right click', async () => {
  const onSortChange = vi.fn()
  renderTable({onSortChange})
  await userEvent.pointer({keys: '[MouseRight>]', target: screen.getByRole('columnheader', {name:/id/i})})
  await userEvent.click(screen.getByRole('menuitem', {name: '升序排序'}))
  expect(onSortChange).toHaveBeenCalledWith({column: 'id', direction: 'asc'})
})
