# Database Workbench Interactive Prototype Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a local, high-fidelity React prototype of the database workbench that matches the supplied desktop references and demonstrates the full connection, catalog, data, schema, query, and team-copy interactions.

**Architecture:** Add an independent Vite HTML entry at `/prototype.html` backed by focused React prototype components and fixture state. Keep its tokens and layout in an isolated stylesheet so no production route or CSS is changed; interactions use local component state and deterministic fixture data.

**Tech Stack:** React 19, TypeScript, Vite, Vitest, Testing Library, plain CSS, inline SVG icons.

## Global Constraints

- Do not deploy the prototype to `10.10.80.71`; run and verify locally only.
- Do not add UI or animation packages.
- Product copy uses “复制到个人”, never “导入” or “迁移”.
- Target desktop viewports are 1440×900 and 1920×1080.
- All visible controls must work; no decorative buttons.
- All motion must respect `prefers-reduced-motion`.
- Prototype styles must not change production components or global workbench tokens.

---

### Task 1: Prototype Entry, Model, and Workbench Shell

**Files:**
- Create: `web/prototype.html`
- Create: `web/src/prototype/main.tsx`
- Create: `web/src/prototype/model.ts`
- Create: `web/src/prototype/fixtures.ts`
- Create: `web/src/prototype/components/PrototypeIcon.tsx`
- Create: `web/src/prototype/PrototypeApp.tsx`
- Create: `web/src/prototype/prototype.css`
- Test: `web/src/prototype/PrototypeApp.test.tsx`

**Interfaces:**
- Produces `PrototypeView = 'data' | 'schema' | 'query'`.
- Produces `ConnectionFixture`, `DatabaseFixture`, `TableFixture`, `TeamConnectionFixture` types.
- Produces `<PrototypeApp />`, the state owner consumed by later components.

- [ ] **Step 1: Write the failing shell test**

```tsx
render(<PrototypeApp />)
expect(screen.getByText('数据库管理')).toBeVisible()
expect(screen.getByLabelText('个人连接')).toBeVisible()
expect(screen.getByLabelText('数据库对象')).toBeVisible()
expect(screen.getByRole('main', {name: '数据库工作区'})).toBeVisible()
```

- [ ] **Step 2: Run the shell test and verify RED**

Run: `cd web && npm test -- --run src/prototype/PrototypeApp.test.tsx`

Expected: FAIL because `PrototypeApp` and prototype entry do not exist.

- [ ] **Step 3: Add typed fixtures and the four-column shell**

Create fixture arrays for three personal connections, six databases, a grouped `public` schema, twenty table rows, and seven team connections. Implement a 52px top bar plus 260px connection column, 252px catalog column, and fluid main workspace.

- [ ] **Step 4: Add isolated design tokens and responsive containment**

Define `--proto-*` colors, typography, spacing, radius, borders, shadows, motion, density, fixed-column scrolling, and `@media (prefers-reduced-motion: reduce)` only under `.prototype-root`.

- [ ] **Step 5: Run the shell test and production build**

Run: `cd web && npm test -- --run src/prototype/PrototypeApp.test.tsx && npm run build`

Expected: PASS and Vite build exits 0.

- [ ] **Step 6: Commit**

```bash
git add web/prototype.html web/src/prototype
git commit -m "feat: scaffold interactive workbench prototype"
```

### Task 2: Personal Connections and Grouped Object Catalog

**Files:**
- Create: `web/src/prototype/components/ConnectionSidebar.tsx`
- Create: `web/src/prototype/components/CatalogSidebar.tsx`
- Modify: `web/src/prototype/PrototypeApp.tsx`
- Modify: `web/src/prototype/prototype.css`
- Test: `web/src/prototype/ConnectionSidebar.test.tsx`

**Interfaces:**
- `ConnectionSidebar` consumes connections, selected ID, connected ID, search, and team count; emits select/search/new/edit/delete/share/open-team actions.
- `CatalogSidebar` consumes databases, schema groups, and selected table; emits database/table selection.

- [ ] **Step 1: Write failing connection and catalog tests**

```tsx
expect(screen.getByText('连接：个人连接')).toBeVisible()
await user.click(screen.getByRole('button', {name: '连接 192.168.6.100'}))
expect(onSelect).toHaveBeenCalledWith('conn-2')
await user.type(screen.getByRole('searchbox', {name: '搜索个人连接'}), '10.10')
expect(screen.getByText('10.10.80.122_pg')).toBeVisible()
expect(screen.queryByText('192.168.6.100')).not.toBeInTheDocument()
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `cd web && npm test -- --run src/prototype/ConnectionSidebar.test.tsx`

Expected: FAIL because sidebar components do not exist.

- [ ] **Step 3: Implement the reference connection column**

Render context header, shared-count entry, refresh, search, full-width connection rows, semantic status badges, fixed team-copy entry, and fixed new/edit/delete/share/profile footer. Hide row tools until selection context moves to the footer.

- [ ] **Step 4: Implement the grouped catalog column**

Render database section, schema section, object-type groups with counts, selected table state, filter action, overflow action, independent scrolling, and table node selection.

- [ ] **Step 5: Verify interactions and commit**

Run: `cd web && npm test -- --run src/prototype/ConnectionSidebar.test.tsx src/prototype/PrototypeApp.test.tsx`

Expected: all focused tests PASS.

```bash
git add web/src/prototype
git commit -m "feat: prototype connection and object navigation"
```

### Task 3: Data Workspace and Team Copy Dialog

**Files:**
- Create: `web/src/prototype/components/DataWorkspace.tsx`
- Create: `web/src/prototype/components/DataGrid.tsx`
- Create: `web/src/prototype/components/TeamConnectionsDialog.tsx`
- Modify: `web/src/prototype/PrototypeApp.tsx`
- Modify: `web/src/prototype/prototype.css`
- Test: `web/src/prototype/DataWorkspace.test.tsx`
- Test: `web/src/prototype/TeamConnectionsDialog.test.tsx`

**Interfaces:**
- `DataWorkspace` consumes active table, rows, density, visible columns, filter state, and page; emits workspace-tab, toolbar, row, and pagination actions.
- `TeamConnectionsDialog` consumes team rows and personal source IDs; emits close and `copy(ids: string[])`.

- [ ] **Step 1: Write failing data workspace tests**

```tsx
expect(screen.getByText('public.conversation_record')).toBeVisible()
expect(screen.getByText('12,568 行')).toBeVisible()
await user.click(screen.getByRole('button', {name: 'WHERE 条件'}))
expect(screen.getByLabelText('筛选字段')).toBeVisible()
await user.click(screen.getByRole('button', {name: '紧凑密度'}))
expect(screen.getByRole('grid')).toHaveAttribute('data-density', 'compact')
```

- [ ] **Step 2: Write failing team bulk-copy tests**

```tsx
await user.click(screen.getByRole('button', {name: '浏览团队连接'}))
await user.click(screen.getByRole('checkbox', {name: '选择 10.10.80.122_pg'}))
await user.click(screen.getByRole('checkbox', {name: '选择 192.168.6.100'}))
await user.click(screen.getByRole('button', {name: '复制选中（2）'}))
expect(screen.getAllByText('已在个人')).toHaveLength(3)
```

- [ ] **Step 3: Run both tests and verify RED**

Run: `cd web && npm test -- --run src/prototype/DataWorkspace.test.tsx src/prototype/TeamConnectionsDialog.test.tsx`

Expected: FAIL because both components do not exist.

- [ ] **Step 4: Implement the data identity, tabs, toolbar, grid, and pagination**

Keep identity bar, secondary tabs, toolbar, grid header, grid body, horizontal scroller, status line, and pagination in separate rows. Implement search, WHERE expansion, density toggle, column menu, row selection, previous/next page, and active metadata updates.

- [ ] **Step 5: Implement modal search, filters, selection, and copy feedback**

Render eight table columns, disabled copied rows, search/type/status filters, selection count, bulk button, Escape close, modal entrance, and immediate copied-state update in `PrototypeApp`.

- [ ] **Step 6: Verify and commit**

Run: `cd web && npm test -- --run src/prototype/DataWorkspace.test.tsx src/prototype/TeamConnectionsDialog.test.tsx src/prototype/PrototypeApp.test.tsx`

Expected: all focused tests PASS.

```bash
git add web/src/prototype
git commit -m "feat: prototype data workspace and team copy flow"
```

### Task 4: Schema and SQL Query Prototype States

**Files:**
- Create: `web/src/prototype/components/SchemaWorkspace.tsx`
- Create: `web/src/prototype/components/QueryWorkspace.tsx`
- Modify: `web/src/prototype/components/DataWorkspace.tsx`
- Modify: `web/src/prototype/PrototypeApp.tsx`
- Modify: `web/src/prototype/prototype.css`
- Test: `web/src/prototype/WorkspaceModes.test.tsx`

**Interfaces:**
- `SchemaWorkspace` consumes field fixtures and emits field edits, add-field, reset, preview, and save.
- `QueryWorkspace` consumes editor split and query status; emits SQL change, split resize, run, stop, and new query.

- [ ] **Step 1: Write failing workspace-mode tests**

```tsx
await user.click(screen.getByRole('tab', {name: '字段结构'}))
await user.clear(screen.getByLabelText('字段 created_time 默认值'))
await user.type(screen.getByLabelText('字段 created_time 默认值'), 'now()')
expect(screen.getByText('有 1 项未保存修改')).toBeVisible()
expect(screen.getByText(/ALTER COLUMN created_time/)).toBeVisible()
await user.click(screen.getByRole('tab', {name: 'query_01'}))
await user.click(screen.getByRole('button', {name: '运行查询'}))
expect(screen.getByText('查询成功')).toBeVisible()
```

- [ ] **Step 2: Run the test and verify RED**

Run: `cd web && npm test -- --run src/prototype/WorkspaceModes.test.tsx`

Expected: FAIL because schema/query workspace modes do not exist.

- [ ] **Step 3: Implement schema editor and DDL preview**

Render fields/indexes/relations/permissions/DDL tabs, editable field rows, changed-row marker, dirty summary, preview panel, validation panel, reset, preview, and save feedback.

- [ ] **Step 4: Implement query context and resizable split**

Render database/schema/table selectors, run/stop/refresh/export/new-query actions, SQL editor, pointer/keyboard resizer, result grid, and success status. Clamp split between 28% and 72%.

- [ ] **Step 5: Verify and commit**

Run: `cd web && npm test -- --run src/prototype && npm run build`

Expected: all prototype tests PASS and build exits 0.

```bash
git add web/src/prototype
git commit -m "feat: prototype schema and query workspaces"
```

### Task 5: Local Browser Visual Verification

**Files:**
- Modify: `web/src/prototype/prototype.css`
- Modify only if behavior fails: `web/src/prototype/components/*`

**Interfaces:**
- Consumes the completed `/prototype.html` entry.
- Produces local screenshots at 1440×900 and 1920×1080 plus a clean console result.

- [ ] **Step 1: Run the local Vite server**

Run: `cd web && npm run dev -- --host 127.0.0.1`

Expected: Vite reports a local URL and `/prototype.html` returns HTTP 200.

- [ ] **Step 2: Verify the 1440×900 data state**

Check that all four layout columns remain visible, the table identity/toolbar/header never overlap, and only the data grid scrolls horizontally.

- [ ] **Step 3: Verify team, schema, and query interactions**

Open the team dialog and copy two rows; close it; switch to field structure and edit a default; switch to query and run. Verify state feedback after every action and zero console errors.

- [ ] **Step 4: Verify the 1920×1080 state and reduced motion**

Check table density, sidebar scrolling, dialog width, resizer bounds, focus rings, and `prefers-reduced-motion` behavior.

- [ ] **Step 5: Fix only verified visual defects, rerun tests, and commit**

Run: `cd web && npm test -- --run src/prototype && npm run build`

Expected: all prototype tests PASS, build exits 0, browser console contains no errors.

```bash
git add web/src/prototype web/prototype.html
git commit -m "style: polish local workbench prototype"
```
