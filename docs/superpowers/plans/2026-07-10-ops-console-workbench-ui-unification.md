# Ops Console Workbench UI Unification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild Connections, Logs, and Settings as one cohesive desktop workbench UI based on the existing Database page while preserving every current business flow.

**Architecture:** Add business-agnostic workbench and form primitives under `web/src/features/ui`, then compose them inside each route without moving API requests or domain state into the shared layer. Keep the global Ops Console shell, remove its decorative treatment, and give each target route a compact internal toolbar/sidebar/workspace structure.

**Tech Stack:** React 19, TypeScript 5.8, React Router 7, CSS modules/global feature CSS, Vitest 3, Testing Library, Vite 7.

## Global Constraints

- The Database page is the only visual reference.
- Preserve the existing uncommitted backend, logs, teams, users, and dialog changes; never reset or overwrite the working tree.
- Do not introduce a third-party UI component library.
- Browser-native appearances must not be exposed; semantic HTML remains required for accessibility.
- Shared UI components must not import business clients or domain types.
- Keep database, logs, connections, and settings domain state isolated.
- Desktop controls use 32px or 36px heights, 1px borders, 8–12px radii, and no content-card shadows.
- Validate 375×812, 768×1024, and 1440×1000 viewports.

---

## File Structure

**Create:**

- `web/src/features/ui/WorkbenchFrame.tsx`: module toolbar, sidebar, workspace, and mobile sidebar toggle.
- `web/src/features/ui/WorkspaceTabs.tsx`: accessible compact tab row.
- `web/src/features/ui/DataGrid.tsx`: semantic table shell with loading and empty states.
- `web/src/features/ui/StatusBadge.tsx`: semantic status tones.
- `web/src/features/ui/EmptyState.tsx`: compact empty workspace feedback.
- `web/src/features/ui/TextAreaField.tsx`: controlled textarea with label, hint, and error.
- `web/src/features/ui/Dropzone.tsx`: hidden file input plus drag/drop and selected-file summary.
- `web/src/features/ui/workbench.css`: shared workbench layout and component styles.
- `web/src/features/ui/WorkbenchFrame.test.tsx`: layout and responsive-state semantics.
- `web/src/features/ui/WorkspaceTabs.test.tsx`: keyboard and selected-tab behavior.
- `web/src/features/ui/DataGrid.test.tsx`: loading, empty, and table semantics.
- `web/src/features/ui/Dropzone.test.tsx`: picker and drop behavior.

**Modify:**

- `web/src/layout/AppShell.css`: linear global shell aligned to Database.
- `web/src/pages/ConnectionsPage.tsx` and `.css`: workbench composition and complete UI controls.
- `web/src/pages/ConnectionsPage.test.tsx`: connection workspace regressions.
- `web/src/pages/LogsPage.tsx` and `.css`: session sidebar and workspace tabs.
- `web/src/pages/LogsPage.test.tsx`: logs workspace and flow regressions.
- `web/src/settings/SettingsLayout.tsx`: settings workbench shell.
- `web/src/settings/SettingsProfilePage.tsx`: compact profile and team grid.
- `web/src/settings/SettingsTeamsPage.tsx`: team data grid and dialogs.
- `web/src/settings/SettingsUsersPage.tsx`: user data grid and dialogs.
- `web/src/pages/SettingsPage.test.tsx`: settings navigation and management regressions.
- `web/src/features/ui/TextField.tsx`, `Checkbox.tsx`, `FileField.tsx`, `FormDialog.tsx`, `ConfirmDialog.tsx`: consistent shared field/dialog APIs where required.
- `web/src/features/ui/ContextMenu.tsx`: keyboard-complete compact row action menu.
- `web/src/layout/AppShell.css`: shared field, dialog, and application-shell rules only; page-specific workbench styles move out.

---

### Task 1: Shared Workbench Frame and Visual Primitives

**Files:**

- Create: `web/src/features/ui/WorkbenchFrame.tsx`
- Create: `web/src/features/ui/WorkspaceTabs.tsx`
- Create: `web/src/features/ui/StatusBadge.tsx`
- Create: `web/src/features/ui/EmptyState.tsx`
- Create: `web/src/features/ui/workbench.css`
- Create: `web/src/features/ui/WorkbenchFrame.test.tsx`
- Create: `web/src/features/ui/WorkspaceTabs.test.tsx`

**Interfaces:**

- Produces: `WorkbenchFrame`, `WorkbenchSidebar`, `WorkbenchToolbar`, `WorkbenchContent`, `WorkspaceTabs`, `StatusBadge`, and `EmptyState`.
- Consumes: React nodes and callbacks only; no domain data.

- [ ] **Step 1: Write failing frame and tab tests**

```tsx
// WorkbenchFrame.test.tsx
import {render, screen} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {WorkbenchContent, WorkbenchFrame, WorkbenchSidebar, WorkbenchToolbar} from './WorkbenchFrame'

it('labels the module regions and toggles the sidebar on small screens', async () => {
  render(
    <WorkbenchFrame sidebarOpen={false} onSidebarOpenChange={() => undefined}>
      <WorkbenchToolbar title="日志工作台" subtitle="个人" />
      <WorkbenchSidebar label="日志会话">sessions</WorkbenchSidebar>
      <WorkbenchContent label="日志工作台工作区">workspace</WorkbenchContent>
    </WorkbenchFrame>,
  )
  expect(screen.getByRole('banner', {name: '日志工作台工具栏'})).toBeInTheDocument()
  expect(screen.getByRole('complementary', {name: '日志会话'})).toBeInTheDocument()
  expect(screen.getByRole('main', {name: '日志工作台工作区'})).toBeInTheDocument()
})
```

```tsx
// WorkspaceTabs.test.tsx
it('reports and changes the selected workspace tab', async () => {
  const user = userEvent.setup()
  const onChange = vi.fn()
  render(<WorkspaceTabs ariaLabel="日志工具" value="search" onChange={onChange} tabs={[
    {value: 'search', label: '日志检索'}, {value: 'tail', label: '实时 Tail'},
  ]} />)
  expect(screen.getByRole('tab', {name: '日志检索'})).toHaveAttribute('aria-selected', 'true')
  await user.click(screen.getByRole('tab', {name: '实时 Tail'}))
  expect(onChange).toHaveBeenCalledWith('tail')
})
```

- [ ] **Step 2: Run the focused tests and verify they fail**

Run: `cd web && npm test -- --run src/features/ui/WorkbenchFrame.test.tsx src/features/ui/WorkspaceTabs.test.tsx`

Expected: FAIL because the new modules do not exist.

- [ ] **Step 3: Implement the minimal semantic components**

```tsx
// WorkbenchFrame.tsx
import type {ReactNode} from 'react'
import './workbench.css'

export function WorkbenchFrame({children, sidebarOpen, onSidebarOpenChange, className = ''}: {
  children: ReactNode; sidebarOpen: boolean; onSidebarOpenChange(open: boolean): void; className?: string
}) {
  return <section className={`workbench-frame ${className}`} data-sidebar-open={sidebarOpen}>
    <button className="workbench-sidebar-backdrop" aria-label="关闭侧栏" type="button" onClick={() => onSidebarOpenChange(false)} />
    {children}
  </section>
}

export function WorkbenchToolbar({title, subtitle, children, onOpenSidebar}: {
  title: string; subtitle?: string; children?: ReactNode; onOpenSidebar?: () => void
}) {
  return <header className="workbench-toolbar" aria-label={`${title}工具栏`}>
    {onOpenSidebar && <button className="workbench-sidebar-trigger" type="button" onClick={onOpenSidebar}>导航</button>}
    <div className="workbench-title"><strong>{title}</strong>{subtitle && <span>{subtitle}</span>}</div>
    <div className="workbench-toolbar-actions">{children}</div>
  </header>
}

export function WorkbenchSidebar({label, children, footer}: {label: string; children: ReactNode; footer?: ReactNode}) {
  return <aside className="workbench-sidebar" aria-label={label}><div className="workbench-sidebar-body">{children}</div>{footer && <footer>{footer}</footer>}</aside>
}

export function WorkbenchContent({label, children}: {label?: string; children: ReactNode}) {
  return <main className="workbench-content" aria-label={label ?? '工作区'}>{children}</main>
}
```

Implement `WorkspaceTabs` with `role="tablist"`, buttons with `role="tab"`, and `aria-selected`. Implement `StatusBadge` with `data-tone="neutral|info|success|warning|danger"`. Implement `EmptyState` with optional action and no decorative card shadow.

- [ ] **Step 4: Add shared workbench CSS**

```css
.workbench-frame { height: 100%; min-height: 0; display: grid; grid-template: 52px minmax(0,1fr) / 280px minmax(0,1fr); overflow: hidden; border: 1px solid var(--line); background: var(--surface); }
.workbench-toolbar { grid-column: 1 / -1; display: flex; align-items: center; gap: 12px; min-width: 0; padding: 0 12px; border-bottom: 1px solid var(--line); background: var(--surface); }
.workbench-title { display: flex; align-items: baseline; gap: 10px; min-width: 0; }
.workbench-title strong { font-size: 15px; }
.workbench-title span { color: var(--muted); font: 11px var(--font-mono); }
.workbench-toolbar-actions { margin-left: auto; display: flex; align-items: center; gap: 8px; }
.workbench-sidebar { min-height: 0; display: grid; grid-template-rows: minmax(0,1fr) auto; border-right: 1px solid var(--line); background: var(--surface-2); }
.workbench-sidebar-body, .workbench-content { min-height: 0; overflow: auto; }
.workbench-sidebar footer { padding: 10px; border-top: 1px solid var(--line); }
.workspace-tabs { display: flex; min-height: 40px; border-bottom: 1px solid var(--line); background: var(--surface-2); }
.workspace-tab { min-width: 112px; padding: 0 14px; border: 0; border-right: 1px solid var(--line); border-top: 2px solid transparent; color: var(--muted); background: transparent; cursor: pointer; }
.workspace-tab[aria-selected='true'] { border-top-color: var(--accent); color: var(--ink); background: var(--surface); }
```

- [ ] **Step 5: Run tests and typecheck**

Run: `cd web && npm test -- --run src/features/ui/WorkbenchFrame.test.tsx src/features/ui/WorkspaceTabs.test.tsx && npm run typecheck`

Expected: PASS; TypeScript exits 0.

- [ ] **Step 6: Commit the shared workbench foundation**

```bash
git add web/src/features/ui/WorkbenchFrame.tsx web/src/features/ui/WorkspaceTabs.tsx web/src/features/ui/StatusBadge.tsx web/src/features/ui/EmptyState.tsx web/src/features/ui/workbench.css web/src/features/ui/WorkbenchFrame.test.tsx web/src/features/ui/WorkspaceTabs.test.tsx
git commit -m "feat: add shared workbench ui primitives"
```

---

### Task 2: Data Grid, Text Area, and Dropzone Controls

**Files:**

- Create: `web/src/features/ui/DataGrid.tsx`
- Create: `web/src/features/ui/DataGrid.test.tsx`
- Create: `web/src/features/ui/TextAreaField.tsx`
- Create: `web/src/features/ui/Dropzone.tsx`
- Create: `web/src/features/ui/Dropzone.test.tsx`
- Modify: `web/src/features/ui/TextField.tsx`
- Modify: `web/src/features/ui/Checkbox.tsx`
- Modify: `web/src/features/ui/ContextMenu.tsx`
- Modify: `web/src/features/ui/workbench.css`

**Interfaces:**

- Produces: `DataGrid({label, loading, empty, children})`, `TextAreaField`, `Dropzone({label, file, accept, onChange, error})`, and a keyboard-complete existing `ContextMenu`.
- Consumes: semantic table children and controlled values.

- [ ] **Step 1: Write failing grid and dropzone tests**

```tsx
it('renders loading and empty grid states without an empty table', () => {
  const {rerender} = render(<DataGrid label="连接列表" loading empty="暂无连接"><tbody /></DataGrid>)
  expect(screen.getByRole('status')).toHaveTextContent('正在加载')
  rerender(<DataGrid label="连接列表" loading={false} empty="暂无连接"><tbody /></DataGrid>)
  expect(screen.getByText('暂无连接')).toBeInTheDocument()
})
```

```tsx
it('passes a dropped file to the controlled change handler', async () => {
  const onChange = vi.fn()
  render(<Dropzone label="本地日志" file={null} accept=".log,.txt" onChange={onChange} />)
  const file = new File(['line'], 'app.log', {type: 'text/plain'})
  fireEvent.drop(screen.getByLabelText('本地日志'), {dataTransfer: {files: [file]}})
  expect(onChange).toHaveBeenCalledWith(file)
})
```

- [ ] **Step 2: Verify the tests fail**

Run: `cd web && npm test -- --run src/features/ui/DataGrid.test.tsx src/features/ui/Dropzone.test.tsx`

Expected: FAIL because `DataGrid` and `Dropzone` do not exist.

- [ ] **Step 3: Implement the shared controls**

```tsx
// DataGrid.tsx
import type {ReactNode} from 'react'
export function DataGrid({label, loading, empty, children}: {label: string; loading: boolean; empty?: ReactNode; children: ReactNode}) {
  if (loading) return <div className="workbench-state" role="status">正在加载…</div>
  if (empty) return <div className="workbench-state">{empty}</div>
  return <div className="data-grid-wrap"><table className="data-grid" aria-label={label}>{children}</table></div>
}
```

`Dropzone` must render a visually hidden `<input type="file">`, a keyboard-usable `<label>`, `onDragOver`, `onDrop`, filename/size output, and a clear button. `TextAreaField` must mirror `TextField` props and add `rows`, `hint`, `error`, and `aria-invalid`. Extend `TextField` and `Checkbox` only where required to expose consistent `className`, hint, error, and disabled behavior.

Update `ContextMenu` to focus the first enabled item when opened, support ArrowUp/ArrowDown/Home/End, return focus to its trigger on close, and keep Escape dismissal. Replace the generic `div` container with an element that exposes a stable `aria-label` supplied by the caller.

- [ ] **Step 4: Style controls with the workbench density**

Add `.data-grid`, `.workbench-state`, `.dropzone`, `.field-control`, `.field-message`, and `.field-error` rules to `workbench.css`. Table rows use 38px minimum height, 10px horizontal cell padding, sticky 11px uppercase headers, and selected/hover states based on existing tokens.

- [ ] **Step 5: Run focused and existing UI tests**

Run: `cd web && npm test -- --run src/features/ui/DataGrid.test.tsx src/features/ui/Dropzone.test.tsx src/features/ui/SelectControl.test.tsx src/features/ui/ComboboxControl.test.tsx && npm run typecheck`

Expected: PASS with no type errors.

- [ ] **Step 6: Commit the complete control layer**

```bash
git add web/src/features/ui/DataGrid.tsx web/src/features/ui/DataGrid.test.tsx web/src/features/ui/TextAreaField.tsx web/src/features/ui/Dropzone.tsx web/src/features/ui/Dropzone.test.tsx web/src/features/ui/TextField.tsx web/src/features/ui/Checkbox.tsx web/src/features/ui/ContextMenu.tsx web/src/features/ui/workbench.css
git commit -m "feat: complete workbench form and data controls"
```

---

### Task 3: Align the Global Ops Console Shell

**Files:**

- Modify: `web/src/layout/AppShell.css`
- Test: `web/src/app/AppRouter.test.tsx`

**Interfaces:**

- Consumes: existing `AppShell.tsx` DOM and design tokens.
- Produces: a neutral outer shell that does not compete with internal workbenches.

- [ ] **Step 1: Add a shell regression assertion**

In `AppRouter.test.tsx`, assert authenticated routes still expose exactly one `主导航`, one top-level `main`, and the current route link with `aria-current="page"`.

```tsx
expect(screen.getByRole('complementary', {name: '主导航'})).toBeInTheDocument()
expect(screen.getByRole('link', {name: '连接中心'})).toHaveAttribute('aria-current', 'page')
```

- [ ] **Step 2: Run the assertion before CSS changes**

Run: `cd web && npm test -- --run src/app/AppRouter.test.tsx`

Expected: PASS; this establishes behavior that styling must not break.

- [ ] **Step 3: Replace decorative shell styling**

Update `AppShell.css` so `.ops-shell` uses a flat `var(--bg)` background, `.ops-rail` has no box shadow or translucency, `.ops-brand span` uses a 10px radius and no glow, `.ops-rail a` uses 8px radii, `.ops-topbar` removes backdrop blur, and `.ops-main` uses 12px padding with hidden overflow so target workbenches control their own scrolling.

- [ ] **Step 4: Preserve database viewport sizing**

Change `.ops-database-page` to `height: 100%; margin: 0` and add a shared `.ops-workbench-page { height: 100%; min-height: 0; }`. Verify the Database app shell still occupies the entire available route area.

- [ ] **Step 5: Run router tests and build**

Run: `cd web && npm test -- --run src/app/AppRouter.test.tsx && npm run build`

Expected: PASS and Vite production build exits 0.

- [ ] **Step 6: Commit shell alignment**

```bash
git add web/src/layout/AppShell.css web/src/app/AppRouter.test.tsx
git commit -m "style: align ops console shell with workbench ui"
```

---

### Task 4: Rebuild Connections as a Workbench

**Files:**

- Modify: `web/src/pages/ConnectionsPage.tsx`
- Modify: `web/src/pages/ConnectionsPage.css`
- Modify: `web/src/pages/ConnectionsPage.test.tsx`
- Modify: `web/src/features/ui/FormDialog.tsx`
- Modify: `web/src/features/ui/ConfirmDialog.tsx`

**Interfaces:**

- Consumes: Task 1 workbench primitives and Task 2 field/grid components.
- Preserves: `ConnectionsClient`, `ConnectionFormValue`, `openCreate`, `openEdit`, `submit`, and `confirmDelete` behavior.

- [ ] **Step 1: Write failing workspace behavior tests**

Add assertions that the page renders `连接中心工具栏`, `连接筛选`, and `连接列表`; new connection opens a dialog; filter controls update `client.list`; edit uses `FormDialog`; deletion uses `ConfirmDialog`; all fields are reachable by accessible label.

```tsx
expect(screen.getByRole('banner', {name: '连接中心工具栏'})).toBeInTheDocument()
expect(screen.getByRole('complementary', {name: '连接筛选'})).toBeInTheDocument()
await user.click(screen.getByRole('button', {name: '新建连接'}))
expect(screen.getByRole('dialog', {name: '新建连接'})).toBeInTheDocument()
```

- [ ] **Step 2: Verify the new tests fail**

Run: `cd web && npm test -- --run src/pages/ConnectionsPage.test.tsx`

Expected: FAIL because the page still renders heading cards and inline form panels.

- [ ] **Step 3: Compose the workbench layout**

Replace `ops-page`, `page-heading-row`, and `ops-panel` wrappers with `WorkbenchFrame`. Put type/scope filters, search, statistics, and compact empty state in `WorkbenchSidebar`. Put result count and `新建连接` in `WorkbenchToolbar`. Render the table through `DataGrid` in `WorkbenchContent`.

- [ ] **Step 4: Move create/edit/delete into shared dialogs**

Use `FormDialog` for create/edit and `ConfirmDialog` for deletion. Replace every inline input/textarea with `TextField`, `TextAreaField`, or `SelectControl`. Keep the existing `toSaveInput` validation and show `fieldErrors` next to the matching component.

- [ ] **Step 5: Replace row button piles with selection-aware actions**

Add `selectedConnectionId` state. Clicking a row selects it and sets `aria-selected`. The toolbar exposes `编辑` and `删除` for the selected row, while each row uses the shared `ContextMenu` for one compact keyboard-accessible action entry. Do not change the client calls.

- [ ] **Step 6: Rewrite page CSS**

Retain only connection-specific sidebar filters, endpoint truncation, selected-row, and dialog field-grid rules. Delete card, large heading, native input, and duplicate table styles now owned by `workbench.css`.

- [ ] **Step 7: Run connection tests and typecheck**

Run: `cd web && npm test -- --run src/pages/ConnectionsPage.test.tsx src/connections/connectionForm.test.ts && npm run typecheck`

Expected: PASS; all create/edit/delete/filter assertions pass.

- [ ] **Step 8: Commit the connection workbench**

```bash
git add web/src/pages/ConnectionsPage.tsx web/src/pages/ConnectionsPage.css web/src/pages/ConnectionsPage.test.tsx web/src/features/ui/FormDialog.tsx web/src/features/ui/ConfirmDialog.tsx
git commit -m "feat: rebuild connection center as a workbench"
```

---

### Task 5: Rebuild Logs as a Session Workbench

**Files:**

- Modify: `web/src/pages/LogsPage.tsx`
- Modify: `web/src/pages/LogsPage.css`
- Modify: `web/src/pages/LogsPage.test.tsx`
- Modify: `web/src/features/ui/FileField.tsx`

**Interfaces:**

- Consumes: workbench primitives, `WorkspaceTabs`, `Dropzone`, `DataGrid`, fields, and status badges.
- Preserves: current session creation, local upload, search, SSH test/browse/scan/import/batch import, Tail SSE, stop Tail, and indexed entry rendering.

- [ ] **Step 1: Add failing layout and behavior tests**

Test an empty state and a populated session separately. Assert session sidebar, new-session dialog, four workspace tabs, search as default, Dropzone upload, SSH table, Tail status, and existing client calls.

```tsx
expect(screen.getByRole('complementary', {name: '日志会话'})).toBeInTheDocument()
expect(screen.getByRole('tab', {name: '日志检索'})).toHaveAttribute('aria-selected', 'true')
await user.click(screen.getByRole('tab', {name: '本地导入'}))
expect(screen.getByLabelText('本地日志')).toBeInTheDocument()
```

- [ ] **Step 2: Verify the tests fail**

Run: `cd web && npm test -- --run src/pages/LogsPage.test.tsx`

Expected: FAIL because tabs and the workbench regions do not exist.

- [ ] **Step 3: Introduce explicit workspace state**

Add `type LogsWorkspace = 'search' | 'upload' | 'ssh' | 'tail'` and `const [workspace, setWorkspace] = useState<LogsWorkspace>('search')`. Creating or selecting a session keeps search active; starting Tail switches to `tail`; selecting an SSH import action stays in `ssh`.

- [ ] **Step 4: Compose session sidebar and toolbar**

Move new session into `FormDialog`. Put session filtering and list in `WorkbenchSidebar`; show scope and entry count in `WorkbenchToolbar`; render a single empty state when no session exists.

- [ ] **Step 5: Split the main surface into four tab panels**

Use `WorkspaceTabs` with exact values `search`, `upload`, `ssh`, and `tail`. Render only the active panel, but keep all state in `LogsPage` so switching tabs does not discard form input, remote results, or Tail lines.

- [ ] **Step 6: Replace all visible native controls**

Use `TextField`, `SelectControl`, `Dropzone`, `StatusBadge`, and shared buttons. The hidden file input inside `Dropzone` is the only file input. Keep Tail output as a semantic log region with `aria-live="polite"` for status, not for every incoming line.

- [ ] **Step 7: Convert remote and search results to `DataGrid`**

Use a selected-row model for SSH files and keep accessible action buttons. Preserve directory navigation, parent navigation, import, import all, and Tail triggers. Preserve existing level badges and terminal colors.

- [ ] **Step 8: Rewrite logs CSS around the workbench**

Delete page-card, sticky-card, native field, and duplicate table rules. Keep session-row, SSH path, terminal, log message, level tone, and responsive overrides. Tail output must fill remaining workspace height with a 260px minimum.

- [ ] **Step 9: Run logs tests and typecheck**

Run: `cd web && npm test -- --run src/pages/LogsPage.test.tsx && npm run typecheck`

Expected: PASS including upload, search, SSH, and Tail client assertions.

- [ ] **Step 10: Commit the log workbench**

```bash
git add web/src/pages/LogsPage.tsx web/src/pages/LogsPage.css web/src/pages/LogsPage.test.tsx web/src/features/ui/FileField.tsx
git commit -m "feat: rebuild logs as a session workbench"
```

---

### Task 6: Rebuild Settings Layout and Profile

**Files:**

- Modify: `web/src/settings/SettingsLayout.tsx`
- Modify: `web/src/settings/SettingsProfilePage.tsx`
- Modify: `web/src/pages/SettingsPage.test.tsx`
- Modify: `web/src/layout/AppShell.css`

**Interfaces:**

- Consumes: `WorkbenchFrame`, `WorkbenchSidebar`, `WorkbenchToolbar`, `WorkbenchContent`, `DataGrid`, `StatusBadge`, `EmptyState`.
- Preserves: `SettingsOutletContext`, route guards, redirects, and `useSettingsData`.

- [ ] **Step 1: Add failing settings frame tests**

Assert `设置工具栏`, `设置分区`, and `设置工作区` regions; accessible current navigation; hidden admin routes for non-admin users; profile account and joined-team data.

- [ ] **Step 2: Verify the tests fail**

Run: `cd web && npm test -- --run src/pages/SettingsPage.test.tsx`

Expected: FAIL because settings still uses page headings and pill tabs.

- [ ] **Step 3: Compose settings in the shared workbench**

Replace `.ops-page` and `.settings-tabs` with the shared frame. Render allowed routes in `WorkbenchSidebar` using `NavLink`; keep `Outlet` inside `WorkbenchContent`; keep success and error feedback below the compact toolbar and announce it with existing roles.

- [ ] **Step 4: Convert profile cards to compact data surfaces**

Render account fields as a two-column definition grid and teams through `DataGrid`. Use `StatusBadge` for system role and team role. Use a single `EmptyState` when no teams exist.

- [ ] **Step 5: Remove obsolete shared settings styles**

Delete `.settings-tabs`, generic `.ops-panel` layout dependence, large cards, and content shadows from `AppShell.css`. Leave dialog/form rules temporarily until Task 7 finishes moving them.

- [ ] **Step 6: Run settings tests and typecheck**

Run: `cd web && npm test -- --run src/pages/SettingsPage.test.tsx && npm run typecheck`

Expected: PASS for profile and route guard coverage.

- [ ] **Step 7: Commit settings shell and profile**

```bash
git add web/src/settings/SettingsLayout.tsx web/src/settings/SettingsProfilePage.tsx web/src/pages/SettingsPage.test.tsx web/src/layout/AppShell.css
git commit -m "feat: rebuild settings shell and profile workspace"
```

---

### Task 7: Convert Team and User Management to Data Workspaces

**Files:**

- Modify: `web/src/settings/SettingsTeamsPage.tsx`
- Modify: `web/src/settings/SettingsUsersPage.tsx`
- Modify: `web/src/settings/CreateTeamDialog.tsx`
- Modify: `web/src/settings/TeamMembersDialog.tsx`
- Modify: `web/src/settings/CreateUserDialog.tsx`
- Modify: `web/src/settings/EditUserDialog.tsx`
- Modify: `web/src/settings/UserTeamAssignmentsField.tsx`
- Modify: `web/src/pages/SettingsPage.test.tsx`
- Modify: `web/src/layout/AppShell.css`

**Interfaces:**

- Consumes: shared grid, fields, checkbox, select, status, and dialog components.
- Preserves: team create/rename/delete, member diff saving, user create/edit/disable/delete, team assignment, self-protection, and last-admin error behavior.

- [ ] **Step 1: Extend failing management tests**

Add tests that team and user pages render labeled data grids, primary actions in the toolbar, dialogs for create/edit/member management, status controls, and confirm dialogs for destructive actions. Retain existing client call assertions.

- [ ] **Step 2: Verify tests fail against card layouts**

Run: `cd web && npm test -- --run src/pages/SettingsPage.test.tsx`

Expected: FAIL on grid labels and toolbar actions.

- [ ] **Step 3: Convert teams to a data grid**

Render name, member count, current role, and actions in `DataGrid`. Use `FormDialog` for create and rename; keep `TeamMembersDialog` for membership. Replace tag-only summaries with concise counts in the grid and full membership in the dialog.

- [ ] **Step 4: Convert users to a data grid**

Render username, display name, system role, status, teams, and actions through `DataGrid`. Keep the shared `Checkbox` for enabled status and disable it for the signed-in user. Use `StatusBadge` for roles and account state.

- [ ] **Step 5: Normalize all management dialogs**

Ensure every text field uses `TextField`, every choice uses `SelectControl`, every membership toggle uses `Checkbox`, and all errors appear inside the dialog while preserving entered values. Remove raw field styling and business-specific inline styles.

- [ ] **Step 6: Finish settings CSS cleanup**

Move dialog-independent data workspace styles to `workbench.css` or focused settings selectors. Remove obsolete `.team-card`, `.settings-row`, `.settings-table`, `.settings-tabs`, native input, and inline-layout rules from `AppShell.css`.

- [ ] **Step 7: Run complete settings tests**

Run: `cd web && npm test -- --run src/pages/SettingsPage.test.tsx src/settings/errors.test.ts && npm run typecheck`

Expected: PASS for team, member, user, and permission workflows.

- [ ] **Step 8: Commit management workspaces**

```bash
git add web/src/settings web/src/pages/SettingsPage.test.tsx web/src/layout/AppShell.css web/src/features/ui
git commit -m "feat: unify team and user management workspaces"
```

---

### Task 8: Responsive, Accessibility, and Full Browser Verification

**Files:**

- Modify: `web/src/features/ui/workbench.css`
- Modify: `web/src/pages/ConnectionsPage.css`
- Modify: `web/src/pages/LogsPage.css`
- Modify: `web/src/layout/AppShell.css`
- Create: `ui-audit/2026-07-10/01-database-reference.png`
- Create: `ui-audit/2026-07-10/02-connections-desktop.png`
- Create: `ui-audit/2026-07-10/03-logs-desktop.png`
- Create: `ui-audit/2026-07-10/04-settings-desktop.png`
- Create: `ui-audit/2026-07-10/05-target-pages-mobile.png`
- Create: `ui-audit/2026-07-10/report.md`

**Interfaces:**

- Consumes: all prior tasks and the deployed/local authenticated application.
- Produces: verified responsive UI, screenshot evidence, and a concise audit report.

- [ ] **Step 1: Add the required responsive rules**

At `max-width: 1199px`, shrink the internal sidebar to 236px and allow data grids to scroll. At `max-width: 759px`, position `.workbench-sidebar` as a drawer, use `data-sidebar-open` for visibility, show the trigger/backdrop, keep the toolbar sticky, and collapse non-primary toolbar actions into wrapping rows without overlapping content.

- [ ] **Step 2: Run the complete automated frontend suite**

Run: `cd web && npm test -- --run && npm run typecheck && npm run build`

Expected: all Vitest files pass, TypeScript exits 0, and Vite produces `web/dist`.

- [ ] **Step 3: Run repository-level foundation checks**

Run: `make test-foundation`

Expected: Go tests, Vitest, typecheck, and Vite build all pass.

- [ ] **Step 4: Launch or rebuild the application under test**

Use the repository's active development/deployment method without altering production data. Confirm `/health/ready` returns success, then log in with the user-provided test account.

- [ ] **Step 5: Capture the 1440px reference and target pages**

At 1440×1000, capture Database, Connections, Logs, and Settings. Verify: flat shell, matching toolbar density, clear nested-sidebar hierarchy, 32/36px controls, no browser-default select/file/checkbox appearance, no large page titles, no ordinary card shadows, and no duplicate scrolling regions.

- [ ] **Step 6: Exercise the critical browser flows**

Verify connection filters and open/close create/edit dialogs without saving destructive data. Verify logs session selection, workspace tab changes, local file selection, SSH panel navigation against existing safe data, search, Tail start/stop when a safe SSH target exists, and settings profile/team/user navigation with permission-aware actions.

- [ ] **Step 7: Capture tablet and mobile evidence**

At 768×1024 and 375×812, verify sidebar drawer, focus order, dialog containment, horizontal data-grid scrolling, and toolbar action access. Capture the resulting screenshots under `ui-audit/2026-07-10`.

- [ ] **Step 8: Check browser console and accessibility semantics**

Confirm no new console errors. Inspect each target page for one module toolbar, one named internal sidebar, one named workspace, correct `aria-selected` tabs/rows, labeled dialogs, and visible focus rings.

- [ ] **Step 9: Write the audit report**

Record tested URLs, viewport sizes, flows, automated command results, screenshot filenames, remaining concerns, and a final pass/fail against all ten design acceptance criteria in `ui-audit/2026-07-10/report.md`.

- [ ] **Step 10: Commit verification adjustments and evidence**

```bash
git add web/src/features/ui/workbench.css web/src/pages/ConnectionsPage.css web/src/pages/LogsPage.css web/src/layout/AppShell.css ui-audit/2026-07-10
git commit -m "test: verify unified ops console workbench ui"
```

---

## Final Verification Checklist

- [ ] `cd web && npm test -- --run` passes.
- [ ] `cd web && npm run typecheck` passes.
- [ ] `cd web && npm run build` passes.
- [ ] `make test-foundation` passes.
- [ ] Connections, Logs, and Settings match Database at 1440×1000.
- [ ] 768×1024 and 375×812 layouts remain operable.
- [ ] No visible browser-default select, file, checkbox, text, dialog, or menu controls remain in the three target routes.
- [ ] Existing user changes outside the plan remain intact.
