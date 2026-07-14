# Engineering Terminal Redesign Implementation Plan

> **For Codex:** Execute this plan with `superpowers:executing-plans`, following TDD for each behavior change. Preserve all pre-existing dirty worktree changes and do not change backend contracts.

**Goal:** Implement the approved Figma “C · Engineering Terminal” as the shared responsive frontend shell while retaining every existing backend-supported workflow.

**Architecture:** Keep route-owned domain state in the existing pages and workbench. Extend `UnifiedShellContext` into a typed display adapter for resource, context, runtime, and status slots. Refactor `UnifiedShell` into the five-region terminal composition (runtime bar, resource rail, work plane, context rail, status line), with resource/context modal drawers below 768px. Existing page components publish presentation nodes into those slots and retain API calls, mutations, selection state, dialogs, and authorization locally.

**Tech Stack:** React 19, TypeScript, React Router 7, CSS, Vitest, Testing Library, Vite; existing Go API unchanged.

**Global constraints**

- Visual source of truth: <https://www.figma.com/design/ofnuK61hYmvrKyjk8XWvaP>, frames `3:15`, `14:34`, `14:65`, `14:94`, `15:51`.
- Preserve current uncommitted user changes; patch only the named frontend files and new test/plan files.
- No new runtime dependency, endpoint, global domain store, invented metric, or removal of an existing action.
- One semantic main region, labelled rails/drawers, Escape focus restoration, 44px mobile targets, reduced motion, and `aria-live` status.
- Verify at 390, 768, 1440, and 2560 widths; no document-level horizontal overflow.

---

## Task 1: Define the terminal shell slot contract

**Files:**
- Modify: `web/src/layout/UnifiedShellContext.tsx`
- Modify: `web/src/layout/UnifiedShell.test.tsx`

1. Add a failing shell fixture test that publishes resource content, context content, a path/runtime model, and a status message. Assert the desktop shell exposes labelled `资源`, `上下文`, and `状态` regions and renders the published values.
2. Add `UnifiedContextSlot`, `UnifiedRuntimeSlot`, and `UnifiedStatusSlot` types. Extend context state with `contextRail`, `runtime`, and `status` plus stable setters.
3. Add hooks `useUnifiedContext`, `useUnifiedRuntime`, and `useUnifiedStatus` using the same dependency-controlled publish/cleanup pattern as `useUnifiedSidebar`.
4. Run `npm test -- src/layout/UnifiedShell.test.tsx`; the new contract test should pass while existing drawer tests may still fail until Task 2.

## Task 2: Build the Engineering Terminal shell

**Files:**
- Modify: `web/src/layout/UnifiedShell.tsx`
- Rewrite styles in: `web/src/layout/unified-shell.css`
- Modify: `web/src/layout/UnifiedShell.test.tsx`
- Modify: `web/src/layout/unified-shell-layout.test.ts`
- Modify: `web/src/app/tokens.css`

1. Replace D2-specific structural assertions with failing tests for a 52px runtime bar, 248px resource rail, 264px context rail, persistent status line, desktop three-pane grid, and the dark terminal token defaults.
2. Add failing interaction tests for independently opening resource and context drawers, closing either with Escape, and restoring focus to its own trigger.
3. Refactor `UnifiedShellFrame` into:
   - `TerminalRuntimeBar`: brand, route/path, runtime detail, command bar, compact account control, mobile rail triggers.
   - `TerminalResourceRail`: route navigation followed by route-published resources.
   - `main#main-content`: only the route work plane.
   - `TerminalContextRail`: route-published context or a truthful empty selection prompt.
   - `TerminalStatusLine`: status text with polite live announcement.
4. Keep permission-filtered settings navigation and logout behavior. Retain `CommandBar` and its route commands; style it as the compact runtime command entry.
5. Implement a shared modal drawer primitive with labelled dialog semantics, scrim, Escape closure, route-change closure, and trigger focus restoration. On mobile, expose separate `资源` and `上下文` buttons plus a compact bottom dock.
6. Make dark Engineering Terminal tokens the default and retain explicit light/paper/ocean theme overrides. Add terminal-specific sizing/color tokens without breaking existing semantic tokens.
7. Run the two shell test files and TypeScript typecheck.

## Task 3: Adapt Connections Terminal to the context rail

**Files:**
- Modify: `web/src/pages/ConnectionsPage.tsx`
- Modify: `web/src/pages/ConnectionsPage.css`
- Modify: `web/src/pages/ConnectionsPage.test.tsx`

1. Add a failing test: selecting a connection updates the shell `上下文` region with its name, endpoint, credential state, and `打开工作台`; the main table no longer owns a nested inspector column.
2. Move the existing connection inspector JSX into a memoized `contextContent`, publish it with `useUnifiedContext`, and keep selection/action handlers route-local.
3. Publish runtime path (`connections / selected-name`) and a status line reflecting loading, errors, success, or visible counts.
4. Flatten the main work plane to toolbar + feedback + data grid. Remove the obsolete 288px local inspector grid rule, preserving keyboard-selectable rows and all create/edit/delete forms.
5. Run `npm test -- src/pages/ConnectionsPage.test.tsx`.

## Task 4: Adapt Database and Logs to terminal runtime/context/status

**Files:**
- Modify: `web/src/app/App.tsx`
- Modify: `web/src/app/workbench.css`
- Modify: `web/src/pages/LogsPage.tsx`
- Modify: `web/src/pages/LogsPage.css`
- Modify: `web/src/pages/LogsPage.test.tsx`
- Modify: `web/src/features/ui/WorkbenchFrame.test.tsx`

1. Add focused failing assertions that the database route publishes connection/runtime state and the logs route publishes selected-session context and result/tail status.
2. In `App.tsx`, retain the existing database resource sidebar and command extras, but publish a compact context summary for driver, endpoint, database/schema, transaction/risk state, and execution availability. Publish the current connection/query state to runtime and status slots.
3. In `LogsPage.tsx`, publish selected session metadata and relevant workspace/tail actions to the context rail. Publish selected session path and searching/tailing/error/result count to runtime/status.
4. Remove only duplicated page-level shell chrome; do not alter API requests, abort behavior, live tail buffering, Monaco, virtual grids, confirmation flows, or tab state.
5. Run the affected page/workbench tests and typecheck.

## Task 5: Adapt Identity and settings navigation

**Files:**
- Modify: `web/src/settings/SettingsLayout.tsx`
- Modify: `web/src/settings/SettingsLayout.css`
- Modify: `web/src/pages/SettingsPage.test.tsx`

1. Add failing assertions that settings resource navigation is published into the resource rail, inaccessible destinations remain absent, and the context rail identifies the active identity/permission workspace.
2. Publish settings navigation/resource content through the shell slot while preserving outlet data and existing system/team admin checks.
3. Publish a path/status model for profile, teams, and users. Keep forms, tables, grants, confirmation, and authorization behavior unchanged.
4. Run settings tests and typecheck.

## Task 6: Responsive and visual integration pass

**Files:**
- Modify as needed: `web/src/layout/unified-shell.css`
- Modify as needed: `web/src/pages/ConnectionsPage.css`
- Modify as needed: `web/src/pages/LogsPage.css`
- Modify as needed: `web/src/app/workbench.css`
- Modify: `web/src/app/workbench-layout.test.ts`

1. Add static CSS assertions for the `767px` drawer breakpoint, 44px mobile dock targets, isolated pane overflow, and context collapse at constrained desktop widths.
2. Ensure page roots fill the work plane (`min-width: 0; min-height: 0`) and dense tables retain internal horizontal scrolling.
3. Ensure only the shell owns viewport height; remove nested shell height calculations that cause clipping.
4. Run layout tests and the full frontend test suite.

## Task 7: Production verification and local launch

**Files:**
- No source changes unless verification reveals a defect; fixes must receive a regression test first.

1. Run `npm test -- --run`, `npm run typecheck`, and `npm run build` in `web`.
2. Run proportional Go checks: `go test ./api/internal/httpapi/... ./api/internal/identity/...` from the repo root because the dirty worktree already contains backend changes that affect integrated confidence.
3. Start the existing backend with its documented command and the Vite frontend using `npm run dev -- --host 127.0.0.1`. Do not replace an already running user process.
4. Use browser QA to inspect `/connections`, `/database`, `/logs`, and allowed `/settings` routes at 390, 768, 1440, and 2560; check console errors, focus restoration, both drawers, overflow, and critical actions.
5. Compare hierarchy, density, dark surface treatment, rail proportions, and mobile dock against the approved Figma frames. Record any intentional deviations caused by truthful backend state.
6. Report local URLs, exact verification results, and the main files changed. Leave the servers running as requested.

## Completion criteria

- The shared shell visibly matches Figma C’s runtime/resource/work/context/status grammar.
- Connections, database, logs, and settings use it without losing existing functionality.
- Selection drives context, errors preserve work, permissions stay enforced, and risky operations remain guarded.
- Automated tests, typecheck, production build, proportional Go tests, and responsive browser QA pass.
- Local backend/frontend processes are running and reachable.
