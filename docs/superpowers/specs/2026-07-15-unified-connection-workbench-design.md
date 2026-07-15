# Unified Connection Workbench Design

## Goal

Database Workbench has exactly one connection concept. Connection Center and the database workspace must read and mutate the same authenticated, server-side registry. A connection created in Connection Center must be visible and usable in the database workspace immediately.

The redesign removes the legacy nickname-scoped registry, browser IndexedDB connection storage, and the legacy workbench shell. SQL, PostgreSQL/MySQL administration, MongoDB, Redis, schema editing, table editing, query history, and export capabilities remain available through the rebuilt database workspace.

## Product rules

- `/api/registry/v2/connections` is the only connection registry.
- Connection ownership is derived from the authenticated principal, never a display nickname.
- Credentials remain encrypted on the server and are never returned to the browser.
- Connection Center is the only place that creates, edits, shares, or deletes connection definitions.
- `/database` consumes those definitions and opens runtime sessions from them.
- Personal and team connections use the same model and permission checks.
- There is no runtime dual-read, dual-write, mirroring, or fallback to the legacy registry.
- Legacy browser records and nickname records are not migrated automatically. Removing the old system is intentional.

## Architecture

### Single registry

The existing PostgreSQL-backed `registry.PGStore` remains the source of truth. The legacy SQLite `registry.Store`, nickname headers, legacy registry routes, profile nickname dependency, connection synchronization layer, and IndexedDB connection store are removed from the production path.

The v2 connection model remains:

- identity: `id`, `name`, `kind`, `driver`
- access: `scope`, `ownerUserId`, `teamId`
- target: `endpoint`, `config`
- secret state: `hasSecret`

List responses stay redacted. Secret material is opened only inside the API process after authorization.

### Saved-connection runtime session

Add an authenticated endpoint:

`POST /api/registry/v2/connections/{id}/sessions`

The endpoint:

1. validates the browser workbench session;
2. loads the authenticated principal;
3. calls `SecretForUse` on the PostgreSQL registry;
4. converts the saved connection and secret into a database runtime input;
5. applies the existing destination network policy;
6. opens the database handle with the existing driver layer;
7. stores the handle in the existing runtime session store;
8. returns `{connectionId, database}` without returning credentials.

Personal ownership and team membership are enforced by `SecretForUse`. PostgreSQL and MongoDB retain their current default-database behavior. Unsupported kinds, including SSH connections, are rejected by this database-session endpoint.

### New database workspace

`/database` is rebuilt as a first-class page under the unified terminal shell. It does not embed the legacy `App` shell.

The page has three coordinated regions:

- resource rail: database connections from the v2 registry, database/schema/table or Redis key navigation after connection;
- work area: query tabs, table data, schema editor, MongoDB views, and Redis console/key views;
- context rail: selected connection, runtime state, active database, transaction state, and object counts.

Opening `/database?connection=<id>` selects and connects that saved database connection. Opening `/database` without a query parameter lists available database connections and asks the user to select one. The empty-state action links to `/connections`; it does not open a second connection-creation dialog.

After a user creates or edits a connection in Connection Center and follows “打开工作台”, the database page fetches the current v2 list and uses the same record. No page relies on nickname state or local connection records.

## Reuse and deletion boundaries

Retain reusable runtime and feature modules:

- API session/query/table/schema/MongoDB/Redis clients;
- SQL editor, result grid, table view, schema workspace;
- MongoDB document/query/schema views;
- Redis key tree, key view, and console;
- query history and transaction helpers.

Remove or replace legacy-only surfaces:

- embedded and standalone branches of `app/App.tsx` after reusable behavior is extracted;
- legacy `ConnectionSidebar`, legacy database `ConnectionDialog`, profile nickname dialog, and team-copy dialog;
- `storage/connections`, `storage/connectionSync`, legacy registry types/API adapters, and nickname profile dependency;
- legacy `/api/registry/personal/*` and `/api/registry/team/*` routes;
- legacy SQLite registry initialization and configuration that no remaining feature uses.

Deletion happens only after replacement tests demonstrate equivalent supported runtime behavior.

## Error handling

- Missing or inaccessible saved connection: show “连接不存在或无权访问” and refresh the registry list.
- Destination policy rejection: show the existing safe destination error without leaking target credentials.
- Driver connection failure: keep the connection selected, show a retry action, and do not create a runtime handle.
- Expired runtime session: recreate the browser workbench session, reconnect the selected saved connection, and preserve the selected connection ID.
- Deleted connection referenced in the URL: remove the invalid query parameter and return to the connection selector.
- Secrets never appear in response bodies, logs, error messages, browser storage, or UI state.

## Testing

### Backend

- Saved database connection opens a runtime session using its encrypted secret.
- Personal connections cannot be used by another user.
- Team connections can be used by members and system administrators, but not unrelated users.
- SSH connections are rejected by the database-session endpoint.
- Destination policy and driver errors do not leak credentials.
- Successful response contains only the runtime connection ID and database.

### Frontend

- A v2 connection returned by the registry appears in the `/database` resource rail.
- `/database?connection=<id>` calls the saved-session endpoint and loads the workspace.
- Empty state links to Connection Center instead of opening a legacy creation form.
- Refreshing the page preserves selection through the connection query parameter.
- SQL, table/schema, MongoDB, and Redis focused tests continue to pass through the new page composition.
- No request is made to legacy nickname registry endpoints.

### Release verification

- Go tests, including PostgreSQL integration tests.
- Frontend unit tests, typecheck, and production build.
- Browser smoke test: create in Connection Center, open the database workspace, observe the same connection, connect, and load metadata.
- Responsive verification at mobile, tablet, and desktop widths.

## Acceptance criteria

1. There is one connection registry in production code and one connection management UI.
2. A newly created database connection is immediately discoverable from `/database`.
3. The workspace connects without returning or storing plaintext credentials in the browser.
4. Existing SQL, schema, table, MongoDB, and Redis operations remain available.
5. Legacy nickname/IndexedDB connection code and routes are removed rather than synchronized.
6. All automated and browser release checks pass before merging to `main`.
