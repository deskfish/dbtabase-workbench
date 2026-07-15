# Ops Console UI Redesign Design

## Goal

Make the authenticated Ops Console feel like one dependable operations product: fast to scan, safe to operate, keyboard-accessible, and genuinely usable from a narrow mobile viewport through desktop workstations.

## Evidence and scope

The 2026-07-10 production audit captured login, connections, database, logs, profile, teams, users, and 390px mobile states. The most important findings are: mobile horizontal overflow, hidden contextual navigation on narrow screens, a command search with no result behavior, a legacy database connection flow separate from the unified registry, repeated/competing actions, and inconsistent page density. Existing APIs, permission boundaries, connection records, logs, and database tools remain in scope and must not regress.

## Considered directions

1. **Precision Console (selected):** a compact, restrained operational workspace. Deep ink navigation anchors the product; warm white working surfaces and a teal action color make data, risk, and status easy to read. The signature move is a single persistent command strip that collapses into a real mobile command/menu trigger.
2. **Editorial Workspace:** lighter, document-like layouts with broad margins and expanded typography. Easier to read but too wasteful for database and log work.
3. **Dark Control Room:** permanently dark, high-density panes with brighter status color. Strong for terminals but would over-emphasize the technical workspace and make administration less approachable.

## Product architecture

- Keep the existing four top-level modules: connection centre, database, logs, and settings.
- Use one shell at every viewport. Desktop presents product navigation plus contextual content. Mobile keeps a compact header and opens the same navigation/context in an accessible drawer; no critical function disappears.
- Keep a single primary action per page. Connections uses `新建连接`, logs uses `新建会话`, settings management uses its creation action. Other actions remain secondary or contextual.
- The database workspace must draw from the unified connection registry so choosing a connection in the connection centre and using it in the database module is one coherent journey.
- The command strip must either perform a useful command/search action or be an explicit navigation control; it must not look interactive while doing nothing.

## Visual system

- Base surfaces: cool off-white and blue-grey, not large coloured fields. Ink is nearly black; muted text retains readable contrast.
- Accent: one teal-blue semantic action colour. Danger, warning, success and information colours stay semantic only.
- Type: current system UI stack and monospace technical stack. General copy has a 14px minimum; dense metadata may be 12px.
- Shape: 6px small controls, 8px standard containers; one border language and low elevation.
- Motion: 140–220ms opacity/transform transitions only; honour `prefers-reduced-motion`.

## Responsive and accessibility rules

- No document-level horizontal scrolling at 390px, 768px, or 1440px.
- Touch targets are at least 44px in mobile navigation. Dense desktop controls remain keyboard-accessible with clear focus rings.
- The mobile drawer traps neither focus nor content: Escape closes it, focus returns to its trigger, and navigation remains labelled.
- Tables gain a labelled scroll wrapper when their data cannot be safely transformed to cards; headers and actions remain available.
- All async feedback uses existing status/alert semantics, with loading, empty, error, and success states visible at the action’s location.

## Acceptance criteria

1. Desktop and mobile screenshots show no clipped controls, black/transparent canvas artefacts, or horizontal document overflow.
2. Every module remains reachable at 390px, including contextual navigation and session actions.
3. Connection selection and database entry use the same registry record without re-entering a second legacy configuration.
4. Command interaction has a real visible outcome and keyboard shortcut.
5. Existing Go and React tests pass; responsive browser checks cover connections, database, logs, and settings at 390px and 1440px.
