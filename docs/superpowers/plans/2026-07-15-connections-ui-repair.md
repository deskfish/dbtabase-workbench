# Connections UI Repair Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Repair the Connections screen and shared command shell without changing the existing terminal design language.

**Architecture:** Keep state behavior in `ConnectionsPage.tsx`, expose a small clear-filter action through existing terminal primitives, and restore missing structural CSS in the shared shell. Tests assert user-visible state and shell behavior; CSS is verified through production build and rendered viewport checks.

**Tech Stack:** React 19, TypeScript, React Router, Vitest, Testing Library, CSS.

## Global Constraints

- No new dependencies or design system.
- Preserve the deployed terminal palette and current routes.
- Preserve user-owned changes in `go.work.sum`, `.gstack/`, and `ui-audit/`.
- Do not create a Git worktree.

---

### Task 1: Truthful filtered empty state

**Files:**
- Modify: `web/src/pages/ConnectionsPage.tsx`
- Modify: `web/src/pages/ConnectionsPage.css`
- Test: `web/src/pages/ConnectionsPage.test.tsx`

**Interfaces:**
- Consumes: existing `query`, `connections`, and `visible` state.
- Produces: a visible `清除筛选` button and distinct empty-registry/empty-filter copy.

- [ ] Add a test that applies the `production` saved view and expects “没有符合 prod 的连接”、the total count, and a clear-filter button.
- [ ] Run the targeted test and confirm it fails because the current generic empty state is rendered.
- [ ] Implement the two empty states and reset query from the clear-filter action.
- [ ] Run the targeted test and confirm it passes.

### Task 2: Shared shell structure and context behavior

**Files:**
- Modify: `web/src/layout/UnifiedShell.tsx`
- Modify: `web/src/layout/unified-shell.css`
- Test: `web/src/layout/UnifiedShell.test.tsx`

**Interfaces:**
- Consumes: `contextRail?.content` from `UnifiedShellContext`.
- Produces: `data-has-context` on the shell and a collapsed desktop context column when there is no content.

- [ ] Add tests for no-context and selected-context shell states.
- [ ] Run the shell test and confirm the new state contract fails.
- [ ] Add the context state attribute and responsive grid rules.
- [ ] Run the shell tests and confirm they pass.

### Task 3: Command bar and page hierarchy

**Files:**
- Modify: `web/src/layout/unified-shell.css`
- Modify: `web/src/pages/ConnectionsPage.css`
- Modify: `web/src/features/ui/terminal-primitives.css`
- Test: `web/src/layout/CommandBar.test.tsx`

**Interfaces:**
- Consumes: existing CommandBar DOM and terminal tokens.
- Produces: complete search, shortcut, breadcrumb, menu, page frame, toolbar, and responsive styles.

- [ ] Extend the command bar test to assert its structural elements and accessible breadcrumb.
- [ ] Run the targeted test and record the expected structural failure.
- [ ] Restore the missing shared layout styles and increase the type/control scale.
- [ ] Run command bar, terminal primitive, and Connections tests.

### Task 4: Verification and visual QA

**Files:**
- Modify only if a verified visual or responsive issue remains.

**Interfaces:**
- Consumes: completed implementation.
- Produces: passing frontend tests, successful production build, and accepted desktop/mobile screenshots.

- [ ] Run the complete frontend test suite.
- [ ] Run TypeScript checking and the production build.
- [ ] Render desktop and mobile widths, compare them with the audit evidence, and repair visible regressions.
- [ ] Re-run the complete verification commands after the final visual change.

## Self-review

- Coverage: every audit finding maps to Tasks 1–3; Task 4 covers responsive and visual evidence gaps.
- Placeholder scan: no deferred implementation placeholders remain.
- Type consistency: the plan uses only existing React state and shell context contracts plus one DOM data attribute.
