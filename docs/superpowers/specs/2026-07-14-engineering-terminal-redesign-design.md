# Engineering Terminal Frontend Redesign

## Goal

Rebuild the Ops Console frontend around the approved **Engineering Terminal** interaction model while preserving the existing Go APIs, authentication and authorization behavior, database workbench capabilities, log workflows, settings administration, and responsive support.

The redesign may replace the current frontend structure and presentation, but it must not invent unsupported backend analytics or remove working product behavior.

## Source of visual truth

- Figma file: <https://www.figma.com/design/ofnuK61hYmvrKyjk8XWvaP>
- Approved desktop direction: `C · Engineering Terminal`
- Approved page family: `C-01 · Connections Terminal`, `C · Engineering Terminal`, `C-03 · Logs Terminal`, and `C-04 · Identity Terminal`
- Approved mobile direction: `C-05 · Mobile Engineering Terminal`

The Figma file is the visual source of truth for layout, density, hierarchy, dark-mode treatment, and the three-pane interaction model. Existing product language and API behavior remain the functional source of truth.

## Design thesis

Ops Console should feel like one coherent engineering instrument rather than four separate administration pages. Every route uses the same spatial grammar:

1. A compact runtime bar communicates location and system state.
2. A left resource rail exposes the objects relevant to the current task.
3. A central work plane holds the primary data or editing activity.
4. A right context rail explains the selected object, current runtime, risk, and available actions.
5. A persistent status line confirms results, counts, latency, and failures without obscuring the work.

The signature interaction is **select a resource, work in the center, verify and act in context**.

## Information architecture

The top-level routes remain:

- `/connections`: connection registry and entry point to database workspaces.
- `/database`: SQL, table data, schema, MongoDB, and Redis workspaces.
- `/logs`: uploaded and SSH-backed log sessions, search, timeline, file browsing, and live tail.
- `/settings`: profile, teams, users, membership, roles, and connection grants.

The route navigation becomes a keyboard-friendly command surface rather than a large conventional application sidebar. Route-specific resources occupy the left rail:

- Connections: personal/team connection groups, drivers, status, and scope filters.
- Database: databases, schemas, tables, collections, keys, query history, and driver tools.
- Logs: sessions, sources, files, timelines, saved searches, and live streams.
- Settings: profile, teams, users, members, roles, and connection grants.

Permission checks continue to remove inaccessible settings destinations and actions.

## Shared shell

### Runtime bar

The 52px runtime bar contains:

- Product identity.
- A path-like representation of the current environment and selected resource.
- Live state such as control-plane health, connection latency, query state, or log throughput.
- A command/search entry point with a visible keyboard shortcut on desktop.

Status colors remain semantic. Green indicates a verified healthy or successful state, amber indicates a warning or confirmation requirement, and red indicates a failed or destructive state.

### Resource rail

The 248px resource rail is dense, resizable where the current database workspace already supports resizing, and independently scrollable. It uses expandable resource groups and preserves the current selection programmatically, not only through color.

### Work plane

The central work plane owns the route's primary activity. It supports tabs, toolbars, and split panes without nesting a second product shell. Monaco remains the SQL editor. Existing virtualized grids remain responsible for large data sets.

### Context rail

The 264px context rail is selection-sensitive. It exposes metadata, permission, runtime, and risk information before showing the primary action. Editing and destructive actions appear here when they affect the selected resource.

The rail can be collapsed on constrained desktop widths. On mobile it becomes a modal drawer.

### Status line

The status line reports counts, synchronization time, latency, execution state, and errors. It uses `aria-live` for meaningful asynchronous updates without repeatedly announcing high-frequency log lines.

## Route designs

### Connections Terminal

- Left rail: personal/team connection groups, drivers, scope filters, and status filters.
- Work plane: a compact filter/query block followed by a connection table.
- Context rail: name, driver, scope, endpoint, database, credential state, latency, permission, and the primary `打开工作台` action.
- Selecting a connection updates the context rail without navigation.
- Opening a connection reuses the existing connection and registry APIs, then navigates to `/database` with the selected saved record.
- Create, edit, copy, import, migrate, and delete flows remain available. Forms use focused drawers or dialogs when the operation requires several fields.

### Database Terminal

- Left rail: saved connections, databases, object tree, MongoDB collections, Redis keys, and query history.
- Work plane: query tabs, Monaco editor, table data, schema tools, MongoDB document/query views, Redis key/console views, and result grids.
- Context rail: driver, host, active database/schema, role, latency, transaction state, detected risk, and execution controls.
- Query and table tabs retain their state across selection changes.
- Existing preview/confirm behavior remains mandatory for risky SQL, row mutations, schema changes, index deletion, and destructive database operations.

### Logs Terminal

- Left rail: sessions grouped by recency, uploaded files, SSH sources, saved searches, timelines, and live streams.
- Work plane: search/query controls above the selected stream, timeline, file tree, or results.
- Context rail: source type, host, path, files, matches, time window, stream status, and pause/resume actions.
- Live tail communicates throughput in the runtime bar and does not steal focus as new lines arrive.
- Upload, SSH test/browse/scan/import, session deletion, file browsing, search, timeline, and tail capabilities map directly to existing APIs.

### Identity and Permissions Terminal

- Left rail: profile, teams, users, members, roles, and connection grants.
- Work plane: member tables, user administration, team membership, and access matrices.
- Context rail: selected user/team, system role, team role, connection grants, allowed actions, and active/disabled state.
- System and team administrators see only the controls permitted by the existing session and team-role model.
- Create, update, disable, delete, membership, and grant changes require explicit save or confirmation.

## Responsive behavior

Desktop uses the full three-pane model. Tablet may collapse the context rail while keeping the resource rail available. At 767px and below:

- The runtime bar remains fixed at the top.
- The central work plane occupies the viewport.
- Resource and context rails become labelled modal drawers opened from the runtime bar or bottom tool dock.
- The bottom tool dock exposes resources, history, the primary route action, and context.
- Editors and data grids scroll inside their own regions; the document must not gain horizontal overflow.
- Primary touch targets are at least 44px. Dense data remains scrollable and does not force desktop tables into unreadable squeezed columns.

Target verification widths are 390px, 768px, 1440px, and 2560px.

## Visual system

- Theme: dark engineering console using the Figma Simple Design System dark variables.
- Product fonts: `Inter`/`Noto Sans SC` for interface copy and `JetBrains Mono` for paths, queries, logs, identifiers, and data-heavy tables.
- Accent: restrained green for verified operational state. Warning, danger, and information colors remain semantic.
- Density: 10–12px metadata and data text, 12–14px controls, and restrained 16–20px route headings.
- Shape: 6–8px work surfaces, compact control radii, thin borders, and minimal shadows.
- Motion: 120–200ms opacity and transform transitions for drawers, selection, and contextual updates; all motion respects `prefers-reduced-motion`.
- Focus: visible high-contrast focus rings on every interactive element.

## Component boundaries

The implementation should separate shared shell primitives from route-specific workspaces:

- `TerminalShell`: runtime bar, resource rail, work plane, context rail, status line, and responsive drawers.
- `TerminalRuntimeBar`: location, command entry, health, latency, and route state.
- `TerminalResourceRail`: labelled groups, tree/list navigation, resize behavior, and selection semantics.
- `TerminalContextRail`: metadata groups, risk/status summaries, and action slots.
- `TerminalStatusLine`: asynchronous status and error announcements.
- Route adapters for connections, database, logs, and settings that provide resource, context, and status models to the shell.

Existing complex domain components such as Monaco, result grids, table editing, schema workspaces, MongoDB views, Redis views, dialogs, and API clients remain independently testable and are composed inside the new shell rather than rewritten without cause.

## Data and state flow

1. Authentication resolves before the terminal shell renders protected routes.
2. Each route loads its existing API-backed resource model.
3. Selecting a resource updates route-local selection state.
4. The selected resource drives the work plane and context rail through typed adapter data.
5. Mutations execute through existing API clients and update the status line.
6. Successful mutations refresh only affected resources and preserve unrelated tabs, queries, filters, and scroll state.
7. Route transitions preserve the selected connection when moving from the registry into the database workspace.

The shell must not become a global store for domain data. Route state remains close to the route, while the shell receives only the display and interaction contracts it needs.

## Loading, empty, and error states

- Loading: preserve stable pane geometry and show compact skeleton or progress text in the affected pane.
- Empty: explain the missing resource and expose one relevant action, such as creating a connection, importing a log, or adding a team member.
- Offline: retain the selected resource metadata, mark runtime state as offline, and offer a scoped retry.
- Permission denied: explain the required role without exposing an unusable control.
- Expired database session: preserve saved connection and tab context, then offer reconnect.
- Query/log failures: keep the user's query or filter intact, show the error in context and the status line, and permit retry.
- Structure drift or risky operation: block execution, show the reason and affected target, then require a fresh preview or explicit confirmation.

Errors must never clear unrelated work or replace the entire application shell.

## Accessibility

- One semantic `main` region per route.
- A working skip link to the work plane.
- Labelled navigation, resource tree, context, status, dialog, and drawer regions.
- Keyboard navigation for route commands, resource selection, tabs, tables, drawers, and primary actions.
- Escape closes modal drawers and dialogs and returns focus to the trigger.
- Selection, status, and risk are communicated by text or programmatic state in addition to color.
- Live logs do not automatically move keyboard or screen-reader focus.
- Reduced-motion preferences disable nonessential transitions.

## Testing and verification

- Preserve and update existing Vitest coverage for authentication, routes, connections, database workbench, logs, settings, permissions, dialogs, transactions, and responsive shell semantics.
- Add focused tests for resource/context synchronization, drawer focus restoration, selected-connection handoff, permission-hidden actions, status announcements, and risky-operation confirmation.
- Run `npm test`, `npm run typecheck`, and `npm run build` in `web`.
- Run the relevant Go tests when frontend changes affect API assumptions or the integrated build.
- Visually verify the implemented routes against the approved Figma frames at 390px, 768px, 1440px, and 2560px.
- Confirm no document-level horizontal overflow, clipped primary action, console error, or inaccessible focus trap.

## Non-goals

- No backend endpoint or database schema redesign.
- No invented operational analytics or dashboard metrics.
- No replacement of Monaco or the existing virtualized result-grid foundation.
- No new UI framework, icon package, or motion dependency unless implementation proves it is strictly necessary and the user approves it.
- No loss of MongoDB, Redis, SQL, schema, log, registry, authentication, team, or user-management functionality.

## Acceptance criteria

1. Connections, database, logs, and settings visibly share the approved Engineering Terminal shell.
2. The implementation matches the approved Figma hierarchy and dark visual system on desktop and mobile.
3. All existing backend-supported workflows remain reachable and truthful.
4. Resource selection reliably drives the work plane and context rail.
5. Risky and destructive actions remain guarded and understandable.
6. Permission checks, authentication behavior, saved connection handoff, and route behavior do not regress.
7. Loading, empty, offline, permission, expired-session, and operation-error states preserve user work.
8. Automated tests, TypeScript checks, Vite production build, and proportional Go checks pass.
9. Visual QA passes at 390px, 768px, 1440px, and 2560px without document-level overflow or clipped critical controls.
