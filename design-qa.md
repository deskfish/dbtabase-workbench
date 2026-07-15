# Terminal UI kit deep redesign — final QA

## Source visual truth

- Figma file: `ofnuK61hYmvrKyjk8XWvaP`
- Foundations: node `22:57`
- Components: node `24:54`
- Connections: node `26:55`, capture `/tmp/figma-connections.png`
- Teams: node `27:55`, capture `/tmp/figma-teams.png`
- Users: node `28:55`, capture `/tmp/figma-users.png`

## Rendered implementation evidence

- Local URL: `http://127.0.0.1:5173/`
- Viewport/state: 1440 × 900, authenticated local administrator, three teams, five users, and three saved connection records.
- Connections: `/tmp/implementation-connections-final.png`
- Teams: `/tmp/implementation-teams-final.png`
- Users: `/tmp/implementation-users-final.png`

## Same-frame comparison evidence

Each Figma frame and its implementation capture were placed side by side at the same 1440 × 900 source dimensions and inspected as one comparison input:

- Users: `/tmp/qa-users-comparison.png`
- Teams: `/tmp/qa-teams-comparison.png`
- Connections: `/tmp/qa-connections-comparison.png`

The implementation preserves the approved terminal-workbench structure: dark operational canvas, compact mono metadata, mint active states, resource rail, data workspace, selected-item context rail, and bottom runtime status. Product data and controls remain driven by the real local API rather than static mock markup.

## Findings and comparison history

1. **Blocked — P1 theme drift.** The first browser pass inherited the saved light application theme, visibly diverging from all approved Figma frames.
2. **Fixed — scoped terminal tokens.** The terminal shell now owns the approved dark palette, so unrelated user theme preferences cannot turn the engineering workbench into the old light card/table surface.
3. **Blocked — P1 settings context collision.** The shared settings parent was overwriting the purpose-built team and user context rails.
4. **Fixed — route-owned context.** Profile keeps its generic context; Teams and Users now render their own resource and identity detail ledgers.
5. **Passed — final same-frame comparison.** No actionable P0, P1, or P2 visual findings remain. Data density differs where the local dataset differs from the illustrative Figma dataset, but hierarchy, component language, spacing system, and interaction placement match the approved direction.

## Required fidelity surfaces

- **Typography:** compact mono labels, uppercase operational metadata, and stronger sans-serif task headings match the approved hierarchy.
- **Spacing/layout:** fixed runtime bar, 248 px resource rail, fluid work plane, 264 px context rail, and bottom status line remain consistent across all three routes.
- **Colors/tokens:** near-black canvas, layered charcoal surfaces, mint active/success, blue scoped state, amber notes, and red destructive actions are locally scoped and consistent.
- **Image quality:** no new illustrative imagery is required by these data-management screens; the existing product mark remains crisp.
- **Copy/content:** labels describe each route's actual server-backed function. Connections, team membership, identity policy, filters, selected context, and danger-zone actions are distinct rather than repeated generic cards.

## Interaction, responsive, and console checks

- Users: filter to `sunzhendong`, select the exact row, and verify edit/disable/delete context actions — passed.
- Teams: select `平台工程`, open the rename dialog, verify fields/actions, and cancel without mutation — passed.
- Connections: filter to SSH, select `Production Bastion`, verify connection context, open the create dialog, and cancel — passed.
- Tablet 1024 px: context rail collapses and document horizontal overflow remains false — passed.
- Mobile 390 px: resource/context rails collapse, bottom dock appears, document horizontal overflow remains false, and the resource drawer opens with semantic dialog content — passed.
- Browser console warnings/errors after the complete flow: none.

final result: passed
