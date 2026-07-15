# Ops Console UI Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a cohesive, responsive Ops Console shell with functioning command navigation, reliable database-entry handoff, and verified UI quality.

**Architecture:** Preserve the existing React/Go product boundaries and central CSS-token system. Upgrade the shared shell first, then route-level context and database handoff, then run automated and browser verification against the deployed equivalent.

**Tech Stack:** React 19, TypeScript, React Router, Vitest, Vite, Go, CSS Grid/Flexbox.

## Global Constraints

- Retain all existing API authorization and encrypted-secret behavior.
- Do not add dependencies.
- Use semantic controls, visible focus, 44px mobile targets, and `prefers-reduced-motion`.
- No horizontal document overflow at 390px, 768px, or 1440px.

---

### Task 1: Align the logs integration test with the unified shell

**Files:**
- Modify: `web/src/pages/LogsPage.test.tsx`
- Reference: `web/src/pages/ConnectionsPage.test.tsx`, `web/src/layout/UnifiedShellTestHarness.tsx`

- [ ] **Step 1: Keep the existing red test result**

Run: `cd web && npm test -- --run src/pages/LogsPage.test.tsx`

Expected: the first test fails because `LogsPage` is rendered outside `UnifiedShellTestHarness` and no `complementary` landmark exists.

- [ ] **Step 2: Add the shared-shell integration wrapper in `renderLogs`**

Wrap `AuthProvider` and `LogsPage` in `UnifiedShellTestHarness`, matching the working connection-page test pattern.

- [ ] **Step 3: Verify the focused test**

Run: `cd web && npm test -- --run src/pages/LogsPage.test.tsx`

Expected: four tests pass and the first test observes the live `日志会话` sidebar supplied by the shell.

### Task 2: Make the unified shell usable on mobile

**Files:**
- Modify: `web/src/layout/UnifiedShell.tsx`
- Modify: `web/src/layout/unified-shell.css`
- Modify: `web/src/layout/UnifiedShellTestHarness.tsx`
- Test: `web/src/layout/UnifiedShellTestHarness.test.tsx` (create)

- [ ] **Step 1: Write a failing drawer test**

Render the harness, activate the mobile navigation trigger, and assert that the labelled navigation and close button become reachable; assert Escape closes the drawer.

- [ ] **Step 2: Verify red**

Run: `cd web && npm test -- --run src/layout/UnifiedShellTestHarness.test.tsx`

Expected: fail because no mobile trigger or drawer state exists.

- [ ] **Step 3: Add minimal accessible drawer state**

Add an explicit menu button, dialog semantics, Escape handling, focus restoration, and CSS that presents the existing sidebar as an overlay only below the content breakpoint.

- [ ] **Step 4: Verify green**

Run: `cd web && npm test -- --run src/layout/UnifiedShellTestHarness.test.tsx`

Expected: pass with navigation preserved at narrow widths.

### Task 3: Make the command strip a real interaction

**Files:**
- Modify: `web/src/layout/CommandBar.tsx`
- Modify: `web/src/layout/UnifiedShell.tsx`
- Modify: `web/src/layout/unified-shell.css`
- Test: `web/src/layout/CommandBar.test.tsx` (create)

- [ ] **Step 1: Write a failing command-shortcut test**

Assert `Meta+K` focuses the command input and an exact module command navigates to the corresponding route.

- [ ] **Step 2: Verify red**

Run: `cd web && npm test -- --run src/layout/CommandBar.test.tsx`

Expected: fail because the input has no keyboard handler or result state.

- [ ] **Step 3: Implement the minimal command menu**

Provide four navigation results and route on selection; keep arbitrary search visibly scoped as unavailable rather than pretending to search data.

- [ ] **Step 4: Verify green**

Run: `cd web && npm test -- --run src/layout/CommandBar.test.tsx`

Expected: pass for keyboard focus and route selection.

### Task 4: Close the connection-to-database entry path

**Files:**
- Modify: `web/src/pages/ConnectionsPage.tsx`
- Modify: `web/src/pages/DatabasePage.tsx`
- Modify: `web/src/app/App.tsx`
- Modify: `web/src/app/AppRouter.test.tsx`
- Modify: `web/src/pages/ConnectionsPage.test.tsx`

- [ ] **Step 1: Write the failing journey test**

Select a registry connection in the connection list, invoke `打开工作台`, and assert the database route receives the selected record identifier.

- [ ] **Step 2: Verify red**

Run: `cd web && npm test -- --run src/pages/ConnectionsPage.test.tsx src/app/AppRouter.test.tsx`

Expected: fail because there is no registry-to-database route handoff.

- [ ] **Step 3: Implement the smallest compatible handoff**

Use a route query parameter and existing connection lookup/connect behaviour; preserve the legacy direct entry only as a fallback for old links.

- [ ] **Step 4: Verify green**

Run: `cd web && npm test -- --run src/pages/ConnectionsPage.test.tsx src/app/AppRouter.test.tsx`

Expected: pass and preserve existing guest/auth routing.

### Task 5: Visual regression and production delivery

**Files:**
- Modify: `web/src/app/tokens.css`
- Modify: `web/src/layout/unified-shell.css`
- Modify: route CSS files only where visual evidence identifies a defect
- Create: `design-qa.md`

- [ ] **Step 1: Capture desktop and mobile evidence**

Run the local app, capture `/connections`, `/database`, `/logs`, and `/settings/users` at 1440×900 and 390×844.

- [ ] **Step 2: Fix only evidenced P0/P1/P2 defects**

Apply token and layout changes for overflow, page density, focus, table scrolling, and action hierarchy.

- [ ] **Step 3: Run full verification**

Run: `make test-foundation`

Expected: Go tests, Vitest, typecheck, and Vite build all exit 0.

- [ ] **Step 4: Record design QA**

Write `design-qa.md` with source/implementation screenshot paths, viewport/state coverage, findings, fixes, and `final result: passed` only when no actionable P0/P1/P2 issue remains.
