# D2 Precision Shell Design

## Goal

Rebuild the authenticated Ops Console frontend as a coherent, high-density operations product inspired by d2-admin while preserving the current React routes, APIs, permissions, dialogs, data tools, and responsive behavior.

## Approved direction

The selected direction is **D2 Precision Shell**: a modernized d2-admin shell with grouped left navigation, a slim command bar, recent-route tabs, cool blue-grey work surfaces, compact tables, and a contextual inspector for the selected object. The signature interaction is “select in the dense workspace, inspect and act in the right rail.”

## Information architecture

- `工作台`: 连接中心、数据库、日志。
- `系统管理`: 个人资料、团队、用户. Permission checks continue to hide routes the current user cannot manage.
- The current route is represented by both the active navigation item and the active route tab.
- Context-specific filters and session lists remain in the left rail below the primary navigation.

## Visual system

- Canvas: cool blue-grey; surfaces: white and near-white; ink: deep navy; muted copy: slate.
- Accent: one operational blue. Success, warning, danger, and information colors are semantic only.
- Typography: existing system UI stack for product copy and existing monospace stack for endpoints, SQL, log lines, and identifiers.
- Density: compact. Body text stays at 14px; metadata may be 11–12px; primary mobile targets stay at least 44px.
- Shape: 4px controls, 6px standard panels, 8px dialogs; borders provide most separation and shadows are reserved for overlays.
- Motion: 140–220ms opacity/transform transitions with a reduced-motion fallback.

## Primary screens

### Connection Center

The page keeps its left-side type/scope/search filters. The main table remains the dominant surface. Selecting a row reveals a 288px inspector containing scope, endpoint, credential status, edit/delete actions, and the primary `打开工作台` navigation action. On narrow screens the inspector becomes an in-flow detail section instead of causing horizontal overflow.

### Database workspace

The database route retains its existing editor, object explorer, result grid, schema tools, and connection behavior. It adopts the shared shell tokens and route tabs so it reads as the same product rather than a nested legacy app.

### Logs and Settings

Logs retain session navigation, import, SSH, tail, and search workspaces. Settings retain profile, team, user, role, and permission flows. Both use the same page toolbar, tabs, table density, empty states, and action hierarchy as Connection Center.

## Responsive and accessibility requirements

- No document-level horizontal overflow at 390px, 768px, or 1440px.
- The full product navigation and page context remain available from the existing accessible mobile drawer.
- Keyboard users can select table rows, reach the inspector, invoke the primary action, and close the drawer with Escape.
- A visible skip link, focus indicators, semantic landmarks, labelled tables, and live feedback remain intact.
- The selected navigation item and table row are conveyed programmatically, not by color alone.

## Non-goals

- No backend or database schema changes.
- No new UI, icon, motion, or CSS framework dependency.
- No replacement of Monaco, result grids, custom controls, or existing business APIs.
- No dashboard charts or invented analytics.

## Acceptance criteria

1. The shell visibly follows the D2 Precision direction across connections, database, logs, and settings.
2. Connection selection produces a useful details inspector with an actual database-workspace link.
3. Existing permissions, dialogs, filters, data operations, and route behavior do not regress.
4. All Vitest tests, TypeScript typecheck, and Vite production build pass.
5. Desktop and mobile screenshots show no clipped primary controls or document-level overflow.
