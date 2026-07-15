# D2 Precision Shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the approved D2 Precision Shell across the existing Ops Console without changing backend behavior.

**Architecture:** Keep the current React route and feature boundaries. Extend the shared shell first, add a self-contained connection inspector second, then consolidate global/page CSS tokens so database, logs, and settings inherit one visual language.

**Tech Stack:** React 19, TypeScript, React Router 7, Vitest, Testing Library, Vite, CSS Grid/Flexbox.

## Global Constraints

- Preserve all existing APIs, permission checks, dialogs, and database/log workflows.
- Add no dependencies.
- Maintain WCAG 2.2 AA semantics, visible focus, reduced motion, and 44px mobile targets.
- Prevent document-level overflow at 390px, 768px, and 1440px.
- Keep one visually dominant primary action per view.

---

### Task 1: D2 navigation groups and recent-route tabs

**Files:**
- Modify: `web/src/layout/UnifiedShell.tsx`
- Modify: `web/src/layout/UnifiedShell.test.tsx`
- Modify: `web/src/layout/unified-shell.css`

**Interfaces:**
- Consumes: `useLocation()`, existing `NavLink` route definitions, current permission flags.
- Produces: `RouteTabs` markup and grouped navigation labelled `工作台` and `系统管理`.

- [ ] **Step 1: Write the failing shell test**

Add assertions that the connections route renders the `工作台` and `系统管理` labels and a `页面标签` navigation with an active `连接中心` tab.

- [ ] **Step 2: Verify red**

Run: `npm test -- --run src/layout/UnifiedShell.test.tsx`
Expected: FAIL because the group labels and route-tab navigation do not exist.

- [ ] **Step 3: Implement the semantic shell structure**

Split the route definitions into workbench and management groups, preserve existing permission checks, and render route tabs between `CommandBar` and `#main-content`. Use `NavLink` for all navigation targets and `aria-label="页面标签"` for the tab strip.

- [ ] **Step 4: Implement D2 shell styling**

Update `unified-shell.css` to use a 224px desktop rail, a 48px command bar, a 36px tab strip, compact active navigation treatment, and the existing accessible mobile drawer below 980px.

- [ ] **Step 5: Verify green**

Run: `npm test -- --run src/layout/UnifiedShell.test.tsx src/layout/unified-shell-layout.test.ts`
Expected: both test files pass.

### Task 2: Selected connection inspector

**Files:**
- Modify: `web/src/pages/ConnectionsPage.tsx`
- Modify: `web/src/pages/ConnectionsPage.css`
- Modify: `web/src/pages/ConnectionsPage.test.tsx`

**Interfaces:**
- Consumes: `selectedConnectionId`, `visible`, `Connection`, `openEdit()`, `setDeleteTarget()`.
- Produces: a labelled `连接详情` complementary region and `/database?connection=<id>` navigation link.

- [ ] **Step 1: Write the failing inspector test**

Select the `Analytics` row, assert the `连接详情` complementary region contains `db.internal:5432/app`, and assert the `打开工作台` link has `href="/database?connection=conn_db"`.

- [ ] **Step 2: Verify red**

Run: `npm test -- --run src/pages/ConnectionsPage.test.tsx`
Expected: FAIL because the inspector and link do not exist.

- [ ] **Step 3: Implement the inspector**

Render the inspector beside the existing `DataGrid` only when a visible connection is selected. Keep edit and delete as secondary controls inside the inspector and keep `新建连接` as the page toolbar's only primary button.

- [ ] **Step 4: Implement adaptive layout**

Use `grid-template-columns: minmax(0, 1fr) 288px` above 1100px. Below 1100px place the inspector below the table; below 760px preserve the existing card-like table rows and 44px action targets.

- [ ] **Step 5: Verify green**

Run: `npm test -- --run src/pages/ConnectionsPage.test.tsx`
Expected: all connection-page tests pass.

### Task 3: Shared tokens and route-level visual consolidation

**Files:**
- Modify: `web/src/app/tokens.css`
- Modify: `web/src/layout/unified-shell.css`
- Modify: `web/src/features/ui/workbench.css`
- Modify: `web/src/app/workbench.css`
- Modify: `web/src/pages/ConnectionsPage.css`
- Modify: `web/src/pages/LogsPage.css`
- Modify: `web/src/settings/SettingsLayout.css`
- Modify: `web/src/layout/unified-shell-layout.test.ts`
- Modify: `web/src/app/workbench-layout.test.ts`

**Interfaces:**
- Consumes: existing semantic CSS variables and established class names.
- Produces: the D2 Precision token values, consistent panel/table density, route tab styling, responsive inspector and workspace behavior.

- [ ] **Step 1: Write failing CSS contract assertions**

Assert the shell defines route tabs, the connection page defines a 288px inspector column, and the embedded database workspace continues to span the full available content column.

- [ ] **Step 2: Verify red**

Run: `npm test -- --run src/layout/unified-shell-layout.test.ts src/app/workbench-layout.test.ts`
Expected: FAIL on the new route-tab and inspector contracts.

- [ ] **Step 3: Apply the token system**

Set the default light canvas to `#eef3f8`, surface to `#ffffff`, secondary surface to `#f6f8fb`, ink to `#172033`, muted text to `#617087`, line to `#d9e2ef`, and accent to `#2f7fe8`. Keep existing dark/slate/paper/ocean themes functional by preserving their semantic variable names.

- [ ] **Step 4: Consolidate workspace chrome**

Use thin borders as the primary separator, 4/6/8px radii, restrained overlay shadows, compact page toolbars, consistent table headers, and a single blue active marker. Remove decorative gradients from profile/avatar UI and reserve gradients only where existing data visualization semantics require them.

- [ ] **Step 5: Verify green**

Run: `npm test -- --run src/layout/unified-shell-layout.test.ts src/app/workbench-layout.test.ts src/features/ui/WorkbenchFrame.test.tsx`
Expected: all focused layout tests pass.

### Task 4: Full verification and responsive QA

**Files:**
- Modify only when verification exposes a defect in the files listed above.

**Interfaces:**
- Consumes: the completed shell, inspector, tokens, and route styles.
- Produces: a tested production build with no known P0/P1 layout defect.

- [ ] **Step 1: Run the complete frontend tests**

Run: `npm test -- --run`
Expected: 55 test files and at least 170 tests pass with zero failures.

- [ ] **Step 2: Run static verification**

Run: `npm run typecheck && npm run build`
Expected: TypeScript and Vite both exit 0.

- [ ] **Step 3: Inspect the diff**

Run: `git diff --check && git diff --stat && git status --short`
Expected: no whitespace errors and only scoped frontend/design-document changes from this implementation plus the user's pre-existing changes.

- [ ] **Step 4: Capture or inspect responsive evidence**

Verify connections, database, logs, and settings at 1440px and 390px when the local authenticated app is available. If authentication/runtime services are unavailable, report that visual QA gap explicitly instead of claiming browser verification.
