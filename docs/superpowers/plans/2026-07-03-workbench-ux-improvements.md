# Database Workbench UX Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve the existing Database Workbench interaction flow with useful disconnected states, a clearer SQL run path, explicit schema read/edit modes, better wide-table context, a team-connection completion state, and accessible tabs/dialog focus.

**Architecture:** Keep the existing React state and API boundaries. Add small view-state helpers for SQL templates and tab keyboard behavior, keep schema drafts inside `SchemaWorkspace`, and report schema dirty state to `App` only for navigation protection. Reuse the existing tokens and components; no backend or data-model changes.

**Tech Stack:** React 19, TypeScript 5.8, Vite 7, Vitest 3, Testing Library, Monaco Editor, existing CSS tokens.

## Global Constraints

- Preserve the existing three-column information architecture and visual language.
- Do not change any backend API, query safety rule, DDL risk confirmation, or driver capability boundary.
- Do not add password-field hiding, masking, or export restrictions.
- Keep PostgreSQL, MySQL, MongoDB, and Redis entry points working.
- Desktop is the acceptance target; mobile layout is out of scope.
- Every behavior change follows red-green-refactor and receives component coverage before production code.

---

## File Structure

- `web/src/app/App.tsx`: disconnected entry actions, SQL template coordination, top-level tabs, and dirty schema navigation protection.
- `web/src/app/App.test.tsx`: integration coverage for disconnected actions, SQL behavior, workspace tab semantics, and dirty navigation protection.
- `web/src/features/editor/SqlEditor.tsx`: editor shortcut and unchanged editor boundary.
- `web/src/features/editor/sqlTemplate.ts`: pure helpers for the SQL guide/template transition.
- `web/src/features/editor/sqlTemplate.test.ts`: pure helper tests.
- `web/src/features/schema/SchemaWorkspace.tsx`: schema read/edit modes, draft actions, dirty reporting, and schema tab semantics.
- `web/src/features/schema/SchemaWorkspace.test.tsx`: schema mode and draft behavior tests.
- `web/src/features/table/TableView.tsx`: sticky/frozen column markers and text-labelled row actions.
- `web/src/features/table/TableView.test.tsx`: grid context and action-label tests.
- `web/src/features/connections/TeamConnectionsDialog.tsx`: available-first filter, completion state, Escape/focus trap/focus restore.
- `web/src/features/connections/TeamConnectionsDialog.test.tsx`: completion and focus tests.
- `web/src/features/ui/useTabList.ts`: shared arrow-key tab focus behavior.
- `web/src/features/ui/useTabList.test.tsx`: keyboard behavior tests.
- `web/src/app/workbench.css`: visual states for empty panels, read-only schema, sticky cells, text tools, tab focus, and completion state.

---

### Task 1: SQL guide text and table-driven template

**Files:**
- Create: `web/src/features/editor/sqlTemplate.ts`
- Create: `web/src/features/editor/sqlTemplate.test.ts`
- Modify: `web/src/app/App.tsx`
- Modify: `web/src/app/App.test.tsx`

**Interfaces:**
- Produces: `SQL_GUIDE: string`, `isSqlGuide(sql: string): boolean`, and `sqlForSelectedTable(currentSql: string, generatedSql: string): string`.
- Consumes: the existing `defaultSelectSQL` output from the selected table in `App`.

- [ ] **Step 1: Write failing pure-helper tests**

```ts
import {expect,it} from 'vitest'
import {SQL_GUIDE,isSqlGuide,sqlForSelectedTable} from './sqlTemplate'

it('uses a comment-only SQL guide',()=>{
  expect(SQL_GUIDE).toBe('-- 从左侧选择一张表，或在这里输入 SQL')
  expect(isSqlGuide(SQL_GUIDE)).toBe(true)
})

it('replaces only the untouched guide when a table is selected',()=>{
  const generated='SELECT *\nFROM public.people\nLIMIT 200;'
  expect(sqlForSelectedTable(SQL_GUIDE,generated)).toBe(generated)
  expect(sqlForSelectedTable('SELECT now();',generated)).toBe('SELECT now();')
})
```

- [ ] **Step 2: Run the helper test and verify RED**

Run: `cd web && npm test -- --run src/features/editor/sqlTemplate.test.ts`

Expected: FAIL because `sqlTemplate.ts` does not exist.

- [ ] **Step 3: Implement the pure helper**

```ts
export const SQL_GUIDE='-- 从左侧选择一张表，或在这里输入 SQL'

export function isSqlGuide(sql:string){return sql.trim()===SQL_GUIDE}

export function sqlForSelectedTable(currentSql:string,generatedSql:string){
  return isSqlGuide(currentSql)?generatedSql:currentSql
}
```

- [ ] **Step 4: Run the helper test and verify GREEN**

Run: `cd web && npm test -- --run src/features/editor/sqlTemplate.test.ts`

Expected: 2 tests PASS.

- [ ] **Step 5: Write failing App integration tests**

Add to `App.test.tsx`:

```tsx
it('starts with the SQL guide and does not overwrite edited SQL on table selection',async()=>{
  render(<App api={fakeAPI()} sessionBootstrap={Promise.resolve('session')} initialConnectionId="connection" />)
  const editor=await screen.findByRole('textbox',{name:'SQL 编辑器'})
  expect(editor).toHaveValue('-- 从左侧选择一张表，或在这里输入 SQL')
  await userEvent.clear(editor)
  await userEvent.type(editor,'SELECT now();')
  await userEvent.click(screen.getByRole('combobox',{name:'查询表'}))
  await userEvent.click(await screen.findByRole('option',{name:'public.call_recording'}))
  expect(editor).toHaveValue('SELECT now();')
})

it('makes Run the first query-toolbar action and exposes the shortcut',async()=>{
  render(<App api={fakeAPI()} sessionBootstrap={Promise.resolve('session')} initialConnectionId="connection" />)
  expect(await screen.findByRole('button',{name:'运行 SQL（Ctrl/Cmd + Enter）'})).toBeVisible()
})
```

- [ ] **Step 6: Run the App tests and verify RED**

Run: `cd web && npm test -- --run src/app/App.test.tsx`

Expected: FAIL on the old `your_table` default and missing Run accessible name.

- [ ] **Step 7: Wire the helper and Run presentation into App**

Use `initialSQL = SQL_GUIDE`, place the Run button before context selectors, set `aria-label="运行 SQL（Ctrl/Cmd + Enter）"`, render `<kbd>⌘/Ctrl Enter</kbd>`, and call:

```ts
const nextSQL=sqlForSelectedTable(activeTab.sql,defaultSelectSQL(table,driver))
updateTab(activeTab.id,{sql:nextSQL})
```

Do not overwrite non-guide SQL.

- [ ] **Step 8: Run focused tests and commit**

Run: `cd web && npm test -- --run src/features/editor/sqlTemplate.test.ts src/app/App.test.tsx`

Expected: all focused tests PASS.

Commit:

```bash
git add web/src/features/editor/sqlTemplate.ts web/src/features/editor/sqlTemplate.test.ts web/src/app/App.tsx web/src/app/App.test.tsx
git commit -m "feat: clarify sql query entry"
```

---

### Task 2: Disconnected workspace actions

**Files:**
- Modify: `web/src/app/App.tsx`
- Modify: `web/src/features/connections/ConnectionSidebar.tsx`
- Modify: `web/src/app/App.test.tsx`
- Modify: `web/src/app/workbench.css`

**Interfaces:**
- Produces: `ConnectionSidebar` optional callbacks `onRequestNewConnection` and `onRequestTeamConnections`, plus a stable `data-testid="connection-search"` focus target.
- Consumes: existing new-connection and team-dialog state inside `ConnectionSidebar`.

- [ ] **Step 1: Write the failing disconnected-state test**

```tsx
it('offers useful disconnected workspace actions',async()=>{
  render(<App api={fakeAPI()} sessionBootstrap={Promise.resolve('session')} />)
  expect(await screen.findByText('先连接数据库，再开始工作')).toBeVisible()
  expect(screen.getByRole('button',{name:'选择连接'})).toBeVisible()
  expect(screen.getByRole('button',{name:'新建连接'})).toBeVisible()
  expect(screen.getByRole('button',{name:'团队连接'})).toBeVisible()
  await userEvent.click(screen.getByRole('button',{name:'选择连接'}))
  expect(screen.getByRole('searchbox',{name:'搜索个人连接'})).toHaveFocus()
})
```

- [ ] **Step 2: Run the test and verify RED**

Run: `cd web && npm test -- --run src/app/App.test.tsx -t "offers useful disconnected"`

Expected: FAIL because the actions and heading do not exist.

- [ ] **Step 3: Expose sidebar actions and render the empty states**

Add a `ConnectionSidebarHandle` with:

```ts
export type ConnectionSidebarHandle={
  focusConnectionSearch:()=>void
  openNewConnection:()=>void
  openTeamConnections:()=>void
}
```

Use `forwardRef/useImperativeHandle` to invoke existing sidebar state setters. In `App`, render a disconnected object-panel empty state and workspace action group calling the handle methods.

- [ ] **Step 4: Add compact empty-state styling**

Add `.object-empty-state`, `.workspace-onboarding`, and `.workspace-onboarding-actions`; use existing surfaces, tokens, `button` classes, and no new colors.

- [ ] **Step 5: Run focused tests and commit**

Run: `cd web && npm test -- --run src/app/App.test.tsx`

Expected: App tests PASS.

Commit:

```bash
git add web/src/app/App.tsx web/src/app/App.test.tsx web/src/features/connections/ConnectionSidebar.tsx web/src/app/workbench.css
git commit -m "feat: guide disconnected workspace entry"
```

---

### Task 3: Explicit schema read and edit modes

**Files:**
- Create: `web/src/features/schema/SchemaWorkspace.test.tsx`
- Modify: `web/src/features/schema/SchemaWorkspace.tsx`
- Modify: `web/src/app/App.tsx`
- Modify: `web/src/app/App.test.tsx`
- Modify: `web/src/app/workbench.css`

**Interfaces:**
- Produces: `SchemaWorkspace` prop `onDirtyChange?: (dirty:boolean)=>void`; local `editing:boolean` defaults to false.
- Consumes: existing `operations`, `load`, `refreshPreview`, and `execute` behavior.

- [ ] **Step 1: Write failing read/edit mode tests**

```tsx
it('starts read-only and enters edit mode explicitly',async()=>{
  renderSchema()
  expect(await screen.findByText('id')).toBeVisible()
  expect(screen.queryByRole('textbox',{name:'字段名 1'})).not.toBeInTheDocument()
  await userEvent.click(screen.getByRole('button',{name:'编辑结构'}))
  expect(screen.getByRole('textbox',{name:'字段名 1'})).toBeVisible()
})

it('discards draft changes and returns to read-only mode',async()=>{
  renderSchema()
  await userEvent.click(await screen.findByRole('button',{name:'编辑结构'}))
  await userEvent.clear(screen.getByRole('textbox',{name:'字段名 1'}))
  await userEvent.type(screen.getByRole('textbox',{name:'字段名 1'}),'renamed_id')
  expect(screen.getByText('已修改 1 项')).toBeVisible()
  await userEvent.click(screen.getByRole('button',{name:'放弃'}))
  expect(screen.getByText('id')).toBeVisible()
  expect(screen.queryByRole('textbox',{name:'字段名 1'})).not.toBeInTheDocument()
})
```

- [ ] **Step 2: Run schema tests and verify RED**

Run: `cd web && npm test -- --run src/features/schema/SchemaWorkspace.test.tsx`

Expected: FAIL because schema controls are currently always editable.

- [ ] **Step 3: Implement read/edit rendering**

Add `editing` state. In read mode render field values as `.field-cell`, index and relation actions hidden, and top action `编辑结构`. In edit mode render the existing controls and actions plus:

```tsx
<strong className="dirty-state">已修改 {operations.length} 项</strong>
<button className="button" onClick={()=>setPreviewOpen(v=>!v)}>预览 SQL</button>
<button className="button" disabled={!operations.length} onClick={discard}>放弃</button>
<button className="button primary" disabled={!operations.length||!preview||busy||previewBusy} onClick={()=>void execute()}>保存</button>
```

`discard` restores `detail.table.columns`, clears `extra/preview/message`, and sets `editing=false`. A successful execute also sets `editing=false` after `load()`.

- [ ] **Step 4: Report dirty state and protect view changes**

Call `onDirtyChange?.(editing && operations.length>0)` in an effect. In `App`, store dirty schema tab ids. Before data-preview switch, table-tab close, connection switch, or `beforeunload`, call the existing browser confirmation with `表结构有未保存修改，确认放弃？`; cancel leaves current state unchanged.

- [ ] **Step 5: Run schema and App tests, then commit**

Run: `cd web && npm test -- --run src/features/schema/SchemaWorkspace.test.tsx src/app/App.test.tsx`

Expected: all focused tests PASS.

Commit:

```bash
git add web/src/features/schema/SchemaWorkspace.tsx web/src/features/schema/SchemaWorkspace.test.tsx web/src/app/App.tsx web/src/app/App.test.tsx web/src/app/workbench.css
git commit -m "feat: separate schema browse and edit modes"
```

---

### Task 4: Wide-table context and labelled row actions

**Files:**
- Modify: `web/src/features/table/TableView.tsx`
- Modify: `web/src/features/table/TableView.test.tsx`
- Modify: `web/src/app/workbench.css`

**Interfaces:**
- Produces: `.sticky-row-number`, `.sticky-key-column`, and `.table-text-tool` markers.
- Consumes: existing `uniqueKey`, visible-column indexes, row tools, grid, and pagination.

- [ ] **Step 1: Write failing table-context tests**

```tsx
it('marks the row number and first unique key as frozen context',()=>{
  renderTable({uniqueKey:['id']})
  expect(screen.getByRole('columnheader',{name:'#'})).toHaveClass('sticky-row-number')
  expect(screen.getByRole('columnheader',{name:/id/i})).toHaveClass('sticky-key-column')
})

it('shows text labels for core row actions',()=>{
  renderTable({uniqueKey:['id']})
  expect(screen.getByRole('button',{name:'新增行'})).toHaveTextContent('新增')
  expect(screen.getByRole('button',{name:'刷新'})).toHaveTextContent('刷新')
})
```

- [ ] **Step 2: Run TableView tests and verify RED**

Run: `cd web && npm test -- --run src/features/table/TableView.test.tsx`

Expected: FAIL on missing sticky classes and visible labels.

- [ ] **Step 3: Implement sticky markers and labelled actions**

Compute the first visible unique-key column and apply classes to matching `th/td`. Keep accessible names and add visible text to Add, Delete, Apply, Discard, Refresh, and Stop. Keep disabled behavior unchanged.

- [ ] **Step 4: Implement sticky CSS**

Use `position:sticky`, explicit `left` offsets, `z-index`, and token backgrounds for row number and key cells. Keep `.table-view-head` and `.table-data-bar` sticky within the table workspace; do not change query behavior.

- [ ] **Step 5: Run tests and commit**

Run: `cd web && npm test -- --run src/features/table/TableView.test.tsx`

Expected: TableView tests PASS.

Commit:

```bash
git add web/src/features/table/TableView.tsx web/src/features/table/TableView.test.tsx web/src/app/workbench.css
git commit -m "feat: preserve context in wide tables"
```

---

### Task 5: Team connection completion and dialog focus

**Files:**
- Modify: `web/src/features/connections/TeamConnectionsDialog.tsx`
- Modify: `web/src/features/connections/TeamConnectionsDialog.test.tsx`
- Modify: `web/src/features/connections/ConnectionSidebar.tsx`
- Modify: `web/src/app/workbench.css`

**Interfaces:**
- Produces: default `status='available'`, all-copied completion view, `triggerRef?: RefObject<HTMLElement|null>` focus restoration, and a dialog-contained Tab cycle.
- Consumes: existing `groups`, `isTeamConnectionGroupImported`, `onClose`, and filter controls.

- [ ] **Step 1: Write failing completion and focus tests**

```tsx
it('shows a completion state when every team connection is personal',()=>{
  render(<TeamConnectionsDialog connections={[team]} personalConnections={[personalCopy]} onCopy={vi.fn()} onClose={vi.fn()}/>)
  expect(screen.getByText('团队连接均已添加到个人列表')).toBeVisible()
  expect(screen.queryByRole('button',{name:/复制选中/})).not.toBeInTheDocument()
})

it('shows copied rows from the completion state',async()=>{
  render(<TeamConnectionsDialog connections={[team]} personalConnections={[personalCopy]} onCopy={vi.fn()} onClose={vi.fn()}/>)
  await userEvent.click(screen.getByRole('button',{name:'查看已在个人'}))
  expect(screen.getByText(team.name)).toBeVisible()
})

it('closes on Escape and restores trigger focus',async()=>{
  render(<DialogHarness/>)
  await userEvent.click(screen.getByRole('button',{name:'团队连接'}))
  await userEvent.keyboard('{Escape}')
  expect(screen.getByRole('button',{name:'团队连接'})).toHaveFocus()
})
```

- [ ] **Step 2: Run dialog tests and verify RED**

Run: `cd web && npm test -- --run src/features/connections/TeamConnectionsDialog.test.tsx`

Expected: FAIL because status defaults to all, no completion state exists, and focus is not restored.

- [ ] **Step 3: Implement completion state and footer rules**

Set default status to `available`. Compute `allCopied = groups.length>0 && groups.every(...)`. When `allCopied && status==='available' && !search`, render the completion copy and `查看已在个人`; footer renders only `关闭`. A genuine filter/search miss continues to render `没有匹配的团队连接`.

- [ ] **Step 4: Implement focus handling**

Capture the opener in `ConnectionSidebar`. On mount focus the first interactive dialog control. Handle Escape. Handle Tab/Shift+Tab by cycling through enabled buttons, inputs, and comboboxes inside the dialog. On unmount focus the opener.

- [ ] **Step 5: Run tests and commit**

Run: `cd web && npm test -- --run src/features/connections/TeamConnectionsDialog.test.tsx`

Expected: dialog tests PASS.

Commit:

```bash
git add web/src/features/connections/TeamConnectionsDialog.tsx web/src/features/connections/TeamConnectionsDialog.test.tsx web/src/features/connections/ConnectionSidebar.tsx web/src/app/workbench.css
git commit -m "feat: clarify team connection completion"
```

---

### Task 6: Accessible tab semantics and keyboard behavior

**Files:**
- Create: `web/src/features/ui/useTabList.ts`
- Create: `web/src/features/ui/useTabList.test.tsx`
- Modify: `web/src/app/App.tsx`
- Modify: `web/src/features/schema/SchemaWorkspace.tsx`
- Modify: `web/src/app/App.test.tsx`
- Modify: `web/src/features/schema/SchemaWorkspace.test.tsx`
- Modify: `web/src/app/workbench.css`

**Interfaces:**
- Produces: `tabProps(id:string,selected:boolean): {role:'tab'; id:string; 'aria-selected':boolean; tabIndex:number; onKeyDown:KeyboardEventHandler<HTMLButtonElement>}` and stable panel ids.
- Consumes: each tab group's ordered ids and existing selection callback.

- [ ] **Step 1: Write failing keyboard helper test**

```tsx
it('moves focus and selection with arrow keys',async()=>{
  render(<TabHarness ids={['data','schema','ddl']}/>)
  screen.getByRole('tab',{name:'data'}).focus()
  await userEvent.keyboard('{ArrowRight}')
  expect(screen.getByRole('tab',{name:'schema'})).toHaveFocus()
  expect(screen.getByRole('tab',{name:'schema'})).toHaveAttribute('aria-selected','true')
})
```

- [ ] **Step 2: Run helper test and verify RED**

Run: `cd web && npm test -- --run src/features/ui/useTabList.test.tsx`

Expected: FAIL because the helper does not exist.

- [ ] **Step 3: Implement the helper**

Implement ArrowLeft/ArrowUp, ArrowRight/ArrowDown, Home, and End with wraparound. Move DOM focus to the target tab and call `onSelect(targetId)`.

- [ ] **Step 4: Apply standard tab semantics**

For workspace tabs, table data/schema tabs, schema section tabs, query result/history tabs, and Mongo document/query/schema tabs:

```tsx
<div role="tablist" aria-label="表工作区">...</div>
<button role="tab" aria-selected={active} aria-controls={panelId}>...</button>
<section role="tabpanel" id={panelId} aria-labelledby={tabId}>...</section>
```

Replace nested `<i role="button">` tab close controls with sibling real `<button type="button" aria-label="关闭 …">` controls inside a tab wrapper.

- [ ] **Step 5: Add semantic regression assertions**

Assert in App and schema tests that only one tab is selected in each group, panels reference their tabs, and close controls are buttons.

- [ ] **Step 6: Run focused tests and commit**

Run: `cd web && npm test -- --run src/features/ui/useTabList.test.tsx src/app/App.test.tsx src/features/schema/SchemaWorkspace.test.tsx`

Expected: all focused tests PASS.

Commit:

```bash
git add web/src/features/ui/useTabList.ts web/src/features/ui/useTabList.test.tsx web/src/app/App.tsx web/src/app/App.test.tsx web/src/features/schema/SchemaWorkspace.tsx web/src/features/schema/SchemaWorkspace.test.tsx web/src/app/workbench.css
git commit -m "feat: add accessible workspace tabs"
```

---

### Task 7: Full verification and deployed desktop regression

**Files:**
- Modify only if verification reveals an issue: files already listed in Tasks 1–6.

**Interfaces:**
- Consumes: all deliverables from Tasks 1–6.
- Produces: a verified production build and current-run screenshots for the six acceptance states.

- [ ] **Step 1: Run the full frontend test suite**

Run: `cd web && npm test -- --run`

Expected: all tests PASS with zero unhandled errors.

- [ ] **Step 2: Run typecheck and production build**

Run: `cd web && npm run typecheck && npm run build`

Expected: both commands exit 0; Vite writes `web/dist`.

- [ ] **Step 3: Review the final diff**

Run: `git diff --check HEAD~6..HEAD && git status --short`

Expected: no whitespace errors; only the user-owned `ui-audit/` remains untracked unless the user chooses to commit it.

- [ ] **Step 4: Perform browser regression against the deployed or newly served build**

Capture and inspect these states at a desktop viewport: disconnected entry, connected SQL query, table data, schema read mode, schema edit mode, and team completion state. Verify the Run action, table selection non-overwrite, frozen columns, dirty confirmation, Escape close, and focus restoration.

- [ ] **Step 5: Commit verification-only fixes if needed**

If browser regression required a fix, first add a failing component test, verify RED, implement the minimal fix, verify GREEN, then commit only those files:

```bash
git add web/src
git commit -m "fix: resolve workbench ux regression"
```
