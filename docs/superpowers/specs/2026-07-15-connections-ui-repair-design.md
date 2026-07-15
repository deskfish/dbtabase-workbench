# Connections UI Repair Design

## Goal

Repair the deployed Connections screen so the terminal-inspired shell remains distinctive while the page becomes readable, structurally stable, truthful about filtered results, and usable across desktop and mobile widths.

## Approved direction

The existing dark terminal visual language stays in place. The repair uses the current palette, typography families, borders, focus treatment, and React components; it does not introduce a second design system or new dependencies.

## Layout

- Restore explicit shared styles for `unified-page-frame`, `unified-page-toolbar`, `unified-page-title`, and `unified-page-body` so page headers and content use a predictable grid.
- Complete the command bar layout for the icon, search input, shortcut, breadcrumb, result menu, and empty result notice.
- Hide the desktop context rail when there is no selected context, allowing the work area to use the space. Keep the existing mobile context drawer.
- Keep the resource rail fixed and preserve the responsive collapse points already used by the shell.

## Content and state

- Use Chinese as the primary interface language while retaining short terminal status tokens where they add meaning.
- Distinguish a genuinely empty registry from a filtered list with zero matches.
- When filters remove all rows, show the active query, the total number of available connections, and a clear-filter action.
- Keep connection counts consistent between the runtime line, resource rail, page header, and empty state.

## Readability and accessibility

- Raise common secondary text from 9–11px to 12px and normal controls/content to 13–14px.
- Use at least 36px desktop action heights and 44px mobile action heights for primary controls; keep visible focus treatment.
- Preserve semantic navigation, tables, status announcements, labels, skip link, and reduced-motion behavior.
- Avoid relying on color alone for selected and filtered states.

## Acceptance criteria

1. The command bar has no native white input, overlap, clipping, or breadcrumb collision.
2. The page title, subtitle, action, filter, and result region align as a deliberate hierarchy.
3. A query such as `prod` with one nonmatching connection says that no results match and offers a clear action.
4. A registry with zero connections still offers connection creation.
5. No-context desktop views reclaim the context rail while selected connections still show details.
6. Desktop and mobile layouts remain readable and keyboard accessible.

## Self-review

The design preserves the approved aesthetic, covers every P0/P1/P2 finding from the audit, and does not expand the product scope beyond the shared shell and Connections surface.
