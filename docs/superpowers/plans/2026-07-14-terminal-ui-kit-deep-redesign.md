# Terminal UI Kit Deep Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the approved Figma Terminal UI Kit across Connections, Teams, and Users without changing their server-backed capabilities.

**Architecture:** Reuse the existing `UnifiedShell` rail slots and token system. Add a small shared terminal component layer, then make each page publish page-specific resource and context rail content while keeping dialogs and API handlers intact.

**Tech Stack:** React 19, TypeScript, React Router, Vitest, Testing Library, CSS.

## Global Constraints

- Preserve all existing uncommitted workspace changes.
- Do not add dependencies or new routes.
- Do not change API contracts.
- Match Figma nodes `26:55`, `27:55`, and `28:55` at a 1440×900 desktop viewport.
- Do not commit automatically in the dirty shared workspace.

---

### Task 1: Shared terminal interaction primitives

**Files:**
- Create: `web/src/features/ui/TerminalPrimitives.tsx`
- Create: `web/src/features/ui/TerminalPrimitives.test.tsx`
- Create: `web/src/features/ui/terminal-primitives.css`

**Interfaces:**
- Produces: `TerminalStatus`, `TerminalCommandFilter`, and `TerminalInlineAction`.

- [ ] **Step 1: Write failing component behavior tests**

```tsx
render(<TerminalStatus tone="success">正常</TerminalStatus>)
expect(screen.getByText('正常')).toHaveAttribute('data-tone', 'success')
```

- [ ] **Step 2: Run the focused test and verify it fails because the module is missing**

Run: `npm test -- --run src/features/ui/TerminalPrimitives.test.tsx`
Expected: FAIL with unresolved `TerminalPrimitives` import.

- [ ] **Step 3: Implement the minimal typed components and Figma-matched CSS**

```tsx
export function TerminalStatus({tone, children}: TerminalStatusProps) {
  return <span className="terminal-status" data-tone={tone}><i aria-hidden="true" />{children}</span>
}
```

- [ ] **Step 4: Re-run the focused test**

Run: `npm test -- --run src/features/ui/TerminalPrimitives.test.tsx`
Expected: PASS.

### Task 2: Connections terminal

**Files:**
- Modify: `web/src/pages/ConnectionsPage.test.tsx`
- Modify: `web/src/pages/ConnectionsPage.tsx`
- Modify: `web/src/pages/ConnectionsPage.css`

**Interfaces:**
- Consumes: shared terminal primitives and existing UnifiedShell slot hooks.
- Produces: command-filtered, selectable connection list with contextual actions.

- [ ] **Step 1: Add failing tests for command filters, selected row, and contextual delete visibility**
- [ ] **Step 2: Run `npm test -- --run src/pages/ConnectionsPage.test.tsx` and verify the new assertions fail**
- [ ] **Step 3: Replace segmented sidebar controls and generic DataGrid markup with the approved terminal list while preserving API handlers and dialogs**
- [ ] **Step 4: Re-run the focused test and verify all Connections tests pass**

### Task 3: Teams membership workspace

**Files:**
- Modify: `web/src/pages/SettingsPage.test.tsx`
- Modify: `web/src/settings/SettingsTeamsPage.tsx`
- Modify: `web/src/settings/SettingsLayout.css`

**Interfaces:**
- Consumes: `SettingsOutletContext`, UnifiedShell slots, shared terminal primitives.
- Produces: selected-team directory, member workspace, and resource ledger.

- [ ] **Step 1: Add failing tests for team selection, member workspace, and context-only management actions**
- [ ] **Step 2: Run the focused Settings test and verify expected failures**
- [ ] **Step 3: Implement the selected-team workspace without changing create/rename/member/delete calls**
- [ ] **Step 4: Re-run the focused Settings test and verify the team behaviors pass**

### Task 4: Users identity matrix

**Files:**
- Modify: `web/src/pages/SettingsPage.test.tsx`
- Modify: `web/src/settings/SettingsUsersPage.tsx`
- Modify: `web/src/settings/SettingsLayout.css`

**Interfaces:**
- Consumes: `SettingsOutletContext`, UnifiedShell slots, shared terminal primitives.
- Produces: searchable/selectable identity directory, capability matrix, and identity context rail.

- [ ] **Step 1: Add failing tests for identity selection, permission matrix, and protected self actions**
- [ ] **Step 2: Run the focused Settings test and verify expected failures**
- [ ] **Step 3: Implement the identity workspace without changing create/edit/team/disable/delete calls**
- [ ] **Step 4: Re-run the focused Settings test and verify user behaviors pass**

### Task 5: Verification and design QA

**Files:**
- Modify: `design-qa.md`

**Interfaces:**
- Consumes: Figma screenshots and browser-rendered route screenshots.
- Produces: passing automated verification, visual comparison evidence, and a running local server.

- [ ] **Step 1: Run `npm test -- --run`**
- [ ] **Step 2: Run `npm run typecheck`**
- [ ] **Step 3: Run `npm run build`**
- [ ] **Step 4: Start Vite on the requested local interface and inspect Connections, Teams, and Users in the in-app browser**
- [ ] **Step 5: Compare each 1440×900 implementation screenshot with its matching Figma screenshot, fix all P0/P1/P2 differences, and write `design-qa.md` with `final result: passed`**

## Self-review

- Spec coverage: shared language, three distinct page architectures, preserved operations, responsive shell, and accessibility all have explicit tasks.
- Placeholder scan: no TBD/TODO/implement-later markers.
- Type consistency: all page tasks consume the same three shared terminal primitives and the existing `SettingsOutletContext`/UnifiedShell hooks.
