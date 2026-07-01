# Database Workbench Complete Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the complete reference-driven MySQL/PostgreSQL workbench: personal/team connection flows, dual navigation, data/query workspaces, schema inspection and safe visual DDL editing.

**Architecture:** Keep the Go `net/http` API and React application, but split oversized UI behavior into connection-library, object-catalog, data-grid and schema-change modules. Schema changes cross a strict structured-operation boundary: preview creates dialect DDL and a signed short-lived token; execute rechecks the live structure fingerprint before running.

**Tech Stack:** Go 1.25, `database/sql`, pgx, go-sql-driver/mysql, React 19, TypeScript, Vite, Vitest, Testing Library, Monaco, Docker Compose, Caddy.

## Global Constraints

- MySQL and PostgreSQL must both be supported by capability declarations rather than frontend guesses.
- New connections are personal; sharing and copying are idempotent; product copy must not use “导入” or “迁移”.
- Personal and team lists never render simultaneously in the sidebar.
- Passwords never appear in API responses, DDL audit records, logs or UI diagnostics.
- DDL execution requires server-generated preview tokens and live structure-fingerprint verification.
- Risky DDL requires explicit confirmation; MySQL partial-success behavior must be surfaced.
- Existing destination CIDR/port controls, query timeout, cancellation and row limits remain enforced.
- Every behavior change follows test-first RED/GREEN and each task ends in a focused commit.

---

### Task 1: Idempotent Connection Sharing and Copying

**Files:**
- Modify: `api/internal/registry/store.go`
- Modify: `api/internal/httpapi/registry_handlers.go`
- Modify: `web/src/storage/connectionRegistryApi.ts`
- Modify: `web/src/storage/connectionSync.ts`
- Test: `api/internal/registry/store_test.go`
- Test: `api/internal/httpapi/registry_handlers_test.go`
- Test: `web/src/storage/connectionSync.test.ts`

**Interfaces:**
- Produce `SharePersonalToTeam(ctx, owner, personalID) (ConnectionRecord, error)` with source-personal idempotency.
- Produce `CopyTeamToPersonal(ctx, owner, teamID) (ConnectionRecord, error)` with source-team idempotency.
- Produce `GET /api/registry/team/connections` records containing `copiedToPersonal` and personal records containing `sharedToTeam`.

- [ ] Write failing store tests proving repeat share/copy returns the existing record and copy leaves the team record intact.
- [ ] Run `cd api && go test ./internal/registry -run 'Share|Copy'` and verify failures describe missing idempotency/status fields.
- [ ] Add source IDs and lookup indexes to the encrypted registry document, migrate old records on read, and implement idempotent share/copy.
- [ ] Add failing handler/client tests for `POST /api/registry/team/connections/{id}/copy` and status flags.
- [ ] Implement the copy endpoint, keep `/import` as a compatibility alias, and remove import naming from frontend interfaces.
- [ ] Run API and storage tests; expect all PASS.
- [ ] Commit `feat: add idempotent team connection sharing and copying`.

### Task 2: Reference-Style Connection Library

**Files:**
- Rewrite: `web/src/features/connections/ConnectionSidebar.tsx`
- Create: `web/src/features/connections/TeamConnectionsDialog.tsx`
- Modify: `web/src/app/App.tsx`
- Modify: `web/src/features/ui/Icon.tsx`
- Modify: `web/src/app/workbench.css`
- Test: `web/src/features/connections/ConnectionSidebar.test.tsx`
- Test: `web/src/features/connections/TeamConnectionsDialog.test.tsx`

**Interfaces:**
- Sidebar consumes only `savedConnections` and emits share/edit/delete/select actions.
- `TeamConnectionsDialog` consumes team records and emits `onCopy(teamId)`; copied rows render “已在个人”.

- [ ] Write failing UI tests: team records are absent from the sidebar, “团队连接 N” opens one dialog, share calls once, copy changes the row state.
- [ ] Run the two component tests and verify RED.
- [ ] Implement the personal-only sidebar, hover actions, shared state, team count entry, searchable/filterable dialog and copy feedback.
- [ ] Replace old team panel/import props and state in `App.tsx`; refresh personal/team records after share/copy.
- [ ] Apply the reference layout: calm white surfaces, one list skeleton, 16px SVG icons, 32–36px controls and visible focus states.
- [ ] Run all connection and App tests; expect PASS.
- [ ] Commit `feat: redesign personal and team connection library`.

### Task 3: Dual Sidebar Shell and Object Catalog

**Files:**
- Create: `web/src/features/catalog/CatalogSidebar.tsx`
- Rewrite: `web/src/features/explorer/ObjectTree.tsx`
- Modify: `web/src/app/App.tsx`
- Modify: `web/src/app/workbench.css`
- Test: `web/src/features/catalog/CatalogSidebar.test.tsx`
- Test: `web/src/features/explorer/ObjectTree.test.tsx`

**Interfaces:**
- Catalog accepts databases, active database and normalized catalog groups.
- Emits database switch, open table, open structure and context actions.

- [ ] Write failing tests for separate connection/catalog columns, grouped schemas, object counts and selected table state.
- [ ] Run catalog tests and verify RED.
- [ ] Implement the 280px connection column and 250px catalog column, independent scrolling, search and grouped object hierarchy.
- [ ] Preserve existing context-menu actions and database switching.
- [ ] Run catalog, explorer and App tests; expect PASS.
- [ ] Commit `feat: add dual sidebar database navigation`.

### Task 4: Complete Catalog Metadata API

**Files:**
- Create: `api/internal/db/catalog.go`
- Create: `api/internal/db/catalog_mysql.go`
- Create: `api/internal/db/catalog_postgres.go`
- Modify: `api/internal/httpapi/router.go`
- Modify: `web/src/api/types.ts`
- Modify: `web/src/api/client.ts`
- Test: `api/internal/db/catalog_test.go`
- Test: `api/internal/httpapi/catalog_test.go`

**Interfaces:**
- Produce `Catalog` with tables, columns, estimated rows, primary key, indexes, unique constraints, foreign keys, permissions, normalized DDL and `Capabilities`.
- Add `GET /api/connections/{id}/catalog?database=` and table-detail endpoint.

- [ ] Write sqlmock-style query/scan tests for MySQL and PostgreSQL catalog normalization and capability output.
- [ ] Run DB tests and verify RED.
- [ ] Implement dialect readers with bound parameters and identifier-safe metadata queries.
- [ ] Add handler and TypeScript contract tests; implement client mapping.
- [ ] Run Go API/DB and web API tests; expect PASS.
- [ ] Commit `feat: expose normalized database catalog metadata`.

### Task 5: Unified Data Preview Workspace

**Files:**
- Rewrite: `web/src/features/table/TableView.tsx`
- Create: `web/src/features/table/TableWorkspaceHeader.tsx`
- Create: `web/src/features/table/ColumnVisibilityMenu.tsx`
- Create: `web/src/features/table/DataGrid.tsx`
- Create: `web/src/features/table/Pagination.tsx`
- Modify: `web/src/features/table/tableViewState.ts`
- Modify: `web/src/app/workbench.css`
- Test: `web/src/features/table/TableWorkspaceHeader.test.tsx`
- Test: `web/src/features/table/ColumnVisibilityMenu.test.tsx`
- Test: `web/src/features/table/DataGrid.test.tsx`
- Test: `web/src/features/table/Pagination.test.tsx`

**Interfaces:**
- `DataGrid` receives columns/rows/selection/edit draft and is shared by table and query results.
- `Pagination` receives page, pageSize, optional total and emits navigation.

- [ ] Write failing tests for reference header metadata, tabs, search/filter/sort/columns/density, editable cells and pagination.
- [ ] Run table tests and verify RED.
- [ ] Extract grid and pagination without changing mutation semantics; retain exact-one-row safeguards.
- [ ] Implement toolbar, tabs, column visibility, density and total-aware pagination.
- [ ] Run all table, query and App tests; expect PASS.
- [ ] Commit `feat: build unified data preview workspace`.

### Task 6: Reference-Style SQL Query Workspace

**Files:**
- Create: `web/src/features/query/QueryWorkspace.tsx`
- Create: `web/src/features/query/ResizableSplit.tsx`
- Modify: `web/src/features/editor/SqlEditor.tsx`
- Modify: `web/src/app/App.tsx`
- Modify: `web/src/app/workbench.css`
- Test: `web/src/features/query/QueryWorkspace.test.tsx`
- Test: `web/src/features/query/ResizableSplit.test.tsx`

**Interfaces:**
- Query workspace consumes connection/database/schema/table context and existing query callbacks.
- Split persists a clamped percentage in local storage and supports pointer/keyboard resizing.

- [ ] Write failing tests for selectors, run/stop actions, resizable split persistence and shared results grid.
- [ ] Run query tests and verify RED.
- [ ] Implement the reference toolbar and accessible resizer, then migrate query rendering out of `App.tsx`.
- [ ] Reuse `DataGrid`/`Pagination` and preserve CSV/history/transaction behavior.
- [ ] Run editor/query/App tests; expect PASS.
- [ ] Commit `feat: redesign the SQL query workspace`.

### Task 7: Structured Schema Change Model and Dialect DDL

**Files:**
- Create: `api/internal/schema/model.go`
- Create: `api/internal/schema/diff.go`
- Create: `api/internal/schema/mysql.go`
- Create: `api/internal/schema/postgres.go`
- Create: `api/internal/schema/risk.go`
- Test: `api/internal/schema/*_test.go`

**Interfaces:**
- Define structured column/index/foreign-key operations, `Preview`, `Statement`, `Risk` and stable structure fingerprints.
- Produce `Generate(dialect, before, operations) (Preview, error)`.

- [ ] Write table-driven failing tests for add/drop/rename/type/default/null/comment/index/unique/foreign-key DDL in both dialects.
- [ ] Run `cd api && go test ./internal/schema` and verify RED.
- [ ] Implement validation, deterministic normalization, fingerprinting and dialect quoting.
- [ ] Add failing tests for DROP/type-narrowing/NOT NULL/PK/FK risk classification and implement rules.
- [ ] Run schema tests; expect PASS.
- [ ] Commit `feat: generate safe structured schema changes`.

### Task 8: Preview Tokens, Drift Checks and DDL Execution

**Files:**
- Create: `api/internal/schema/service.go`
- Create: `api/internal/httpapi/schema_handlers.go`
- Modify: `api/internal/httpapi/router.go`
- Modify: `api/cmd/server/main.go`
- Test: `api/internal/schema/service_test.go`
- Test: `api/internal/httpapi/schema_handlers_test.go`

**Interfaces:**
- `POST .../schema/preview` returns DDL, warnings, risks, fingerprint and signed 10-minute preview token.
- `POST .../schema/execute` re-reads catalog, validates token/fingerprint/confirmations and returns per-statement results.

- [ ] Write failing service tests for token expiry, tampering, wrong scope, structure drift and confirmation requirements.
- [ ] Run service tests and verify RED.
- [ ] Implement HMAC tokens, in-memory replay protection, live metadata recheck and dialect execution strategies.
- [ ] Write failing HTTP tests for stable error codes and statement results; implement handlers.
- [ ] Add audit records without credentials.
- [ ] Run schema/httpapi/race tests; expect PASS.
- [ ] Commit `feat: preview validate and execute schema changes safely`.

### Task 9: Schema Inspector and Visual Editor

**Files:**
- Create: `web/src/features/schema/SchemaWorkspace.tsx`
- Create: `web/src/features/schema/FieldsEditor.tsx`
- Create: `web/src/features/schema/IndexesEditor.tsx`
- Create: `web/src/features/schema/RelationsEditor.tsx`
- Create: `web/src/features/schema/DDLPreview.tsx`
- Create: `web/src/features/schema/schemaDraft.ts`
- Modify: `web/src/api/client.ts`
- Modify: `web/src/api/types.ts`
- Modify: `web/src/app/App.tsx`
- Modify: `web/src/app/workbench.css`
- Test: `web/src/features/schema/schemaDraft.test.ts`
- Test: `web/src/features/schema/SchemaWorkspace.test.tsx`
- Test: `web/src/features/schema/FieldsEditor.test.tsx`
- Test: `web/src/features/schema/IndexesEditor.test.tsx`
- Test: `web/src/features/schema/RelationsEditor.test.tsx`
- Test: `web/src/features/schema/DDLPreview.test.tsx`

**Interfaces:**
- Draft reducer produces structured operations only.
- Workspace displays fields/indexes/relations/permissions/DDL and calls preview/execute endpoints.

- [ ] Write failing reducer and component tests for all editable field/index/FK operations and read-only permissions.
- [ ] Run schema UI tests and verify RED.
- [ ] Implement editors, drag ordering, dirty state, DDL side panel, warnings and change summary.
- [ ] Add execute confirmation flows for typed targets and MySQL partial-success warnings.
- [ ] Preserve draft on error, refresh catalog on success/drift and expose recovery guidance.
- [ ] Run schema/App tests; expect PASS.
- [ ] Commit `feat: add visual table structure editor`.

### Task 10: Integration, Visual QA and Production Rollout

**Files:**
- Create: `api/integration/workbench_integration_test.go`
- Modify: `deploy/compose.test.yml`
- Modify: `docs/deployment.md`
- Modify: `README.md`

**Interfaces:**
- Test suite provisions MySQL/PostgreSQL and verifies share/copy, catalog, data edits, schema preview/execute, drift and failure behavior.

- [ ] Add integration tests and run against PostgreSQL 17 and MySQL 8.4 until all PASS.
- [ ] Run `make verify`; expect all Go/web tests, race, build and audit PASS.
- [ ] Build production images and run health/session/catalog/query smoke tests.
- [ ] Browser-test reference connection, data, schema and query states at 1280/1440/wide desktop; fix visual/console/accessibility regressions in focused commits.
- [ ] Archive the prior images, deploy to `10.10.80.71`, verify production assets and both database dialects, then remove temporary databases.
- [ ] Commit `docs: document complete workbench operation and recovery`.
