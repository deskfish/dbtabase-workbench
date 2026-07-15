# Terminal UI Kit Deep Redesign

## Goal

Replace the remaining generic CRUD surfaces in Connections, Teams, and Users with the approved Figma engineering-terminal interaction model while preserving all server-backed operations.

## Visual truth

- Figma file: `ofnuK61hYmvrKyjk8XWvaP`
- Connections: node `26:55`
- Teams: node `27:55`
- Users: node `28:55`
- Foundations: node `22:57`
- Components: node `24:54`

## Shared language

- Dark operational canvas using the existing `tokens.css` terminal palette.
- JetBrains Mono for paths, data, statuses, labels, and commands; Inter for page headings and readable prose.
- Dense 40–48px operational rows with square 4–6px radii.
- Selection is shown with a left accent and surface shift, never a large blue pill.
- Status always combines a dot with explicit text.
- Destructive actions appear only in the selected item's context.
- Filters use compact command/condition controls, not segmented cards.

## Page architecture

### Connections

- Resource rail: connection scopes and saved operational views.
- Main surface: page header, command filter, dense selectable connection list.
- Context rail: selected endpoint, ownership, credentials, and open/edit/delete actions.
- Existing create/edit/delete dialogs and database deep link remain functional.

### Teams

- Resource rail: team directory, counts, and selection.
- Main surface: selected team's member workspace with role and status columns.
- Context rail: resource ledger and team-scoped destructive action.
- Existing create, rename, membership, and delete operations remain functional.

### Users

- Resource rail: identity navigation and policy summary.
- Main surface: searchable identity directory plus capability matrix.
- Context rail: selected identity details and contextual edit/delete/disable actions.
- Existing create, edit, team assignment, disable, and delete operations remain functional.

## Responsive behavior

- Desktop uses the three-rail UnifiedShell.
- At the existing shell breakpoints, context and resource rails move into drawers.
- Main tables remain horizontally scrollable where necessary; primary actions stay visible.

## Accessibility

- Rows are keyboard-selectable and expose `aria-selected`.
- Filters have explicit accessible names.
- Status does not rely on color alone.
- Destructive actions retain confirmation dialogs.
- Existing focus-visible and reduced-motion behavior remains intact.
