# Unified Custom Select Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace every native select in the production application with one accessible, reference-matched custom select and remove the obsolete prototype application.

**Architecture:** Extend the existing controlled `SelectControl` as the sole production single-select primitive, with keyboard navigation and a portal-positioned listbox. Migrate each production consumer without changing business state, then remove the separate prototype entry and source tree.

**Tech Stack:** React 19, TypeScript, Vite, Vitest, Testing Library, CSS design tokens.

## Global Constraints

- Do not add a UI library or any new package.
- Preserve existing values, callbacks, defaults, disabled behavior, and theme tokens.
- The production source must contain no native `<select>` after migration.
- Remove only prototype-specific entrypoints, source, styles, fixtures, and tests.

---

### Task 1: Make SelectControl production-complete

**Files:**
- Modify: `web/src/features/ui/SelectControl.tsx`
- Modify: `web/src/features/ui/SelectControl.test.tsx`
- Modify: `web/src/app/workbench.css`

**Interfaces:**
- Consumes: `SelectOption = {value: string; label: string}` and existing theme tokens.
- Produces: `SelectControl({ariaLabel, value, options, onChange, disabled?, className?})` with pointer, Escape, ArrowUp/ArrowDown, Home/End, Enter and Space behavior.

- [ ] **Step 1: Write failing behavior tests**

Add tests that open the listbox, move with ArrowDown, select with Enter, close with Escape, and prevent opening while disabled.

- [ ] **Step 2: Verify tests fail for missing behavior**

Run: `cd web && npm test -- --run src/features/ui/SelectControl.test.tsx`

Expected: keyboard and disabled assertions fail against the current component.

- [ ] **Step 3: Implement the accessible component**

Track the active option, focus the selected option when opening, handle the specified keyboard keys, close on outside pointer/Escape, expose disabled semantics, and render the listbox through `createPortal` with fixed coordinates derived from the trigger rectangle so parent overflow cannot clip it.

- [ ] **Step 4: Match the approved visual language**

Update `.select-control`, `.select-trigger`, `.select-popover`, `.select-option`, and `.select-check` rules using existing semantic tokens: accent open border, surface popover, accent-tinted selected row, check mark, visible focus, compact modifier, and viewport-safe scrolling.

- [ ] **Step 5: Verify the component tests pass**

Run: `cd web && npm test -- --run src/features/ui/SelectControl.test.tsx`

Expected: all SelectControl tests pass with no warnings.

### Task 2: Migrate every production consumer

**Files:**
- Modify: `web/src/app/App.tsx`
- Modify: `web/src/features/connections/TeamConnectionsDialog.tsx`
- Modify: `web/src/features/connections/ProfileDialog.tsx`
- Modify: `web/src/features/connections/ConnectionDialog.tsx`
- Modify: `web/src/features/table/TableView.tsx`
- Modify: `web/src/features/schema/SchemaWorkspace.tsx`
- Modify: `web/src/app/workbench.css`
- Modify tests beside affected features where queries depend on native select behavior.

**Interfaces:**
- Consumes: the completed `SelectControl` API from Task 1.
- Produces: unchanged business callbacks receiving string values, with numeric pagination converting the selected string through `Number(value)`.

- [ ] **Step 1: Add a failing source invariant test**

Extend `web/src/app/entrypoints.test.ts` to recursively inspect production `.tsx` files outside `src/prototype` and assert they do not contain `<select`.

- [ ] **Step 2: Verify the invariant fails**

Run: `cd web && npm test -- --run src/app/entrypoints.test.ts`

Expected: failure lists current native select consumers.

- [ ] **Step 3: Replace each native select**

Import `SelectControl`, map each option to `{value, label}`, preserve controlled state and callbacks, and apply narrow/compact class modifiers only where the existing layout needs them.

- [ ] **Step 4: Remove obsolete native-select CSS selectors**

Move sizing responsibility to wrapper modifier classes and retain input-only rules where forms still use text inputs.

- [ ] **Step 5: Verify migrated feature tests and invariant**

Run: `cd web && npm test -- --run src/app/entrypoints.test.ts src/features/connections src/features/table src/features/schema src/features/ui/SelectControl.test.tsx`

Expected: all selected suites pass and the source invariant finds no native select.

### Task 3: Remove the obsolete prototype application

**Files:**
- Delete: `web/prototype.html`
- Delete: `web/src/prototype/`
- Modify: `web/vite.config.ts`
- Modify: `web/src/app/entrypoints.test.ts`

**Interfaces:**
- Consumes: the single production entry `web/index.html` loading `/src/main.tsx`.
- Produces: a Vite build with only the production HTML input.

- [ ] **Step 1: Change the entrypoint test to require prototype removal**

Assert that `prototype.html` and `src/prototype` do not exist and that Vite config has no prototype input.

- [ ] **Step 2: Verify the removal test fails**

Run: `cd web && npm test -- --run src/app/entrypoints.test.ts`

Expected: failure because prototype files and build input still exist.

- [ ] **Step 3: Remove prototype artifacts and build input**

Delete the prototype HTML and source directory; simplify Vite to its default single `index.html` input.

- [ ] **Step 4: Verify entrypoint tests pass**

Run: `cd web && npm test -- --run src/app/entrypoints.test.ts`

Expected: all entrypoint and source-invariant tests pass.

### Task 4: Full verification and deployment

**Files:**
- Modify only deployment metadata already required by the repository workflow, if any.

**Interfaces:**
- Consumes: repository Makefile, deployment docs, remote/CI configuration.
- Produces: verified production build deployed through the repository's configured release path.

- [ ] **Step 1: Run complete local verification**

Run: `cd web && npm test -- --run && npm run typecheck && npm run build`

Expected: zero failing tests, TypeScript exits 0, and Vite emits the production bundle.

- [ ] **Step 2: Inspect the final diff and source invariant**

Run: `git diff --check && ! rg -n '<select' web/src --glob '!prototype/**'`

Expected: no whitespace errors and no production native selects.

- [ ] **Step 3: Commit the implementation**

Stage only files in this plan and commit with `feat: unify custom select controls`.

- [ ] **Step 4: Execute configured deployment workflow**

Follow the repository's existing ship/deploy configuration, push the current feature branch if required, land through its normal integration path, wait for CI/deploy, then verify the configured production health endpoint and application page.
