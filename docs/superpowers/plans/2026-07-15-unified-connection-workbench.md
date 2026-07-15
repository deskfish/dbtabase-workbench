# Unified Connection Workbench Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the legacy database workbench connection stack with one authenticated v2 registry and make every saved database connection immediately visible and usable in `/database`.

**Architecture:** PostgreSQL `registry.PGStore` remains the only connection source of truth. A new authenticated saved-connection session endpoint opens encrypted credentials server-side, while a rebuilt database page lists v2 records and composes the existing query/schema/table/MongoDB/Redis capabilities without the legacy `App` shell, nickname registry, or IndexedDB storage.

**Tech Stack:** Go 1.25, `net/http`, pgx/PostgreSQL, Redis runtime sessions, React 19, TypeScript, React Router, Vitest/Testing Library, Vite.

## Global Constraints

- `/api/registry/v2/connections` is the only connection registry.
- Connection ownership is derived from the authenticated principal, never a display nickname.
- Credentials remain encrypted on the server and are never returned to the browser.
- Connection Center is the only place that creates, edits, shares, or deletes connection definitions.
- `/database` consumes those definitions and opens runtime sessions from them.
- There is no runtime dual-read, dual-write, mirroring, or fallback to the legacy registry.
- Legacy nickname and browser connection records are intentionally not migrated.
- Preserve SQL, table/schema, MongoDB, Redis, history, transaction, and export capabilities.
- Every behavior change follows red-green-refactor and receives a focused commit.

---

### Task 1: Open runtime sessions from saved v2 database connections

**Files:**
- Modify: `api/internal/httpapi/connection_handlers.go`
- Modify: `api/internal/httpapi/router.go`
- Modify: `api/internal/httpapi/connection_handlers_test.go`
- Modify: `api/internal/httpapi/auth_test.go`

**Interfaces:**
- Consumes: `registry.PGStore.SecretForUse(context.Context, identity.Principal, string) (registry.Connection, registry.Secret, error)` and `session.Store.PutHandle(string, *database.Handle) string`.
- Produces: `POST /api/registry/v2/connections/{id}/sessions` returning `{connectionId: string, database: string}`.

- [ ] **Step 1: Write the failing HTTP tests**

Add a fake registry secret method and tests covering the success response, unauthorized/inaccessible records, SSH rejection, destination rejection, and credential redaction:

```go
func (f *fakeConnectionRegistry) SecretForUse(_ context.Context, p identity.Principal, id string) (registry.Connection, registry.Secret, error) {

	f.secretPrincipal = p
	f.secretID = id
	return f.secretConnection, f.secret, f.secretErr
}

func TestSavedDatabaseConnectionCreatesRuntimeSession(t *testing.T) {

	store := &fakeConnectionRegistry{
		secretConnection: registry.Connection{
			ID: "conn_saved", Kind: "database", Driver: "postgres", Scope: "personal",
			Endpoint: json.RawMessage(`{"host":"db.internal","port":5432}`),
			Config: json.RawMessage(`{"database":"app","tlsMode":"prefer"}`),
		},
		secret: registry.Secret{Username: "ops", Password: "top-secret"},
	}
	opened := database.ConnectionInput{}
	router, loginSession := newAuthenticatedConnectionRouter(t, store, func(_ context.Context, input database.ConnectionInput) (*database.Handle, error) {
		opened = input
		return &database.Handle{Driver: database.PostgreSQL, Config: input}, nil
	})
	req := httptest.NewRequest(http.MethodPost, "/api/registry/v2/connections/conn_saved/sessions", nil)
	req.Header.Set("X-Session-ID", "workbench-session")
	req.Header.Set("X-CSRF-Token", loginSession.CSRFToken)
	req.AddCookie(&http.Cookie{Name: authCookieName, Value: loginSession.ID})
	rr := httptest.NewRecorder()
	router.ServeHTTP(rr, req)

	if rr.Code != http.StatusCreated { t.Fatalf("status=%d body=%s", rr.Code, rr.Body.String()) }
	if opened.Host != "db.internal" || opened.User != "ops" || opened.Password != "top-secret" { t.Fatalf("opened=%+v", opened) }
	if strings.Contains(rr.Body.String(), "top-secret") || strings.Contains(rr.Body.String(), "ops") { t.Fatalf("secret leaked: %s", rr.Body.String()) }
}
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `cd api && go test ./internal/httpapi -run 'TestSavedDatabaseConnection' -count=1`

Expected: FAIL because `ConnectionRegistry` has no `SecretForUse` contract and the route returns 404.

- [ ] **Step 3: Implement the saved-session handler**

Extend the registry contract and register the handler with full dependencies:

```go
type ConnectionRegistry interface {
	List(context.Context, identity.Principal, string, string) ([]registry.Connection, error)
	Create(context.Context, identity.Principal, registry.SaveInput) (registry.Connection, error)
	Update(context.Context, identity.Principal, string, registry.SaveInput) (registry.Connection, error)
	Delete(context.Context, identity.Principal, string) error
	SecretForUse(context.Context, identity.Principal, string) (registry.Connection, registry.Secret, error)
}
```

Decode `Endpoint` and `Config` into a `database.ConnectionInput`, copy only the secret fields required by database drivers, call `ValidateDestination`, preserve PostgreSQL/MongoDB default databases, open the handle with a 10-second context, and store it under the supplied workbench session. Reject non-database kinds with `400 invalid_connection_kind`.

- [ ] **Step 4: Run backend tests and verify GREEN**

Run: `cd api && go test ./internal/httpapi ./internal/registry -count=1`

Expected: PASS with no secret text in HTTP responses.

- [ ] **Step 5: Commit**

```bash
git add api/internal/httpapi/connection_handlers.go api/internal/httpapi/router.go api/internal/httpapi/connection_handlers_test.go api/internal/httpapi/auth_test.go
git commit -m "feat(database): open sessions from saved connections"
```

### Task 2: Add a single frontend connection/session client

**Files:**
- Modify: `web/src/connections/client.ts`
- Modify: `web/src/connections/types.ts`
- Modify: `web/src/api/client.ts`
- Modify: `web/src/api/client.test.ts`
- Create: `web/src/features/database/connectionAdapter.ts`
- Create: `web/src/features/database/connectionAdapter.test.ts`

**Interfaces:**
- Consumes: `ConnectionsClient.list({kind: 'database'})` and the Task 1 saved-session endpoint.
- Produces: `APIClient.connectSaved(connectionId: string): Promise<{connectionId: string; database: string}>` and `toWorkbenchTarget(connection: Connection): WorkbenchTarget`.

- [ ] **Step 1: Write failing client and adapter tests**

```ts
it('opens a runtime session from a saved registry connection', async () => {
  fetchMock.mockResolvedValueOnce(jsonResponse({connectionId: 'runtime-1', database: 'app'}, 201))
  const client = new APIClient()
  client.setSessionId('browser-session')
  await expect(client.connectSaved('conn_saved')).resolves.toEqual({connectionId: 'runtime-1', database: 'app'})
  expect(fetchMock).toHaveBeenCalledWith('/api/registry/v2/connections/conn_saved/sessions', expect.objectContaining({method: 'POST'}))
})

it('maps a redacted v2 database connection without inventing a password', () => {
  expect(toWorkbenchTarget(connection)).toEqual(expect.objectContaining({
    id: 'conn_saved', name: 'Primary', driver: 'postgres', host: 'db.internal', port: 5432, database: 'app', scope: 'personal',
  }))
  expect(toWorkbenchTarget(connection)).not.toHaveProperty('password')
})
```

- [ ] **Step 2: Run focused tests and verify RED**

Run: `cd web && npm test -- --run src/api/client.test.ts src/features/database/connectionAdapter.test.ts`

Expected: FAIL because `connectSaved`, `WorkbenchTarget`, and `toWorkbenchTarget` do not exist.

- [ ] **Step 3: Implement minimal typed client and adapter**

```ts
export type WorkbenchTarget = {
  id: string
  name: string
  driver: DatabaseDriver
  scope: ConnectionScope
  teamId?: string
  host: string
  port: number
  database: string
  hasSecret: boolean
}

export function toWorkbenchTarget(connection: Connection): WorkbenchTarget {
  if (connection.kind !== 'database' || connection.driver === 'ssh') throw new Error('数据库工作台仅支持数据库连接')
  return {
    id: connection.id, name: connection.name, driver: connection.driver, scope: connection.scope,
    teamId: connection.teamId, host: connection.endpoint.host, port: connection.endpoint.port,
    database: typeof connection.config.database === 'string' ? connection.config.database : '', hasSecret: connection.hasSecret,
  }
}
```

`connectSaved` must use the existing CSRF/session request pipeline and must never accept a password argument.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run: `cd web && npm test -- --run src/api/client.test.ts src/features/database/connectionAdapter.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/connections web/src/api/client.ts web/src/api/client.test.ts web/src/features/database/connectionAdapter.ts web/src/features/database/connectionAdapter.test.ts
git commit -m "feat(database): add saved connection runtime client"
```

### Task 3: Build the v2 database resource rail

**Files:**
- Create: `web/src/features/database/DatabaseResourceRail.tsx`
- Create: `web/src/features/database/DatabaseResourceRail.test.tsx`
- Create: `web/src/features/database/database-workbench.css`

**Interfaces:**
- Consumes: `WorkbenchTarget[]`, selected connection ID, runtime/object state, and callbacks supplied by `DatabasePage`.
- Produces: accessible connection selection and database/schema/table or Redis-key navigation for the unified shell sidebar.

- [ ] **Step 1: Write the failing resource-rail test**

```tsx
it('shows every v2 database connection and routes creation to Connection Center', async () => {
  render(<MemoryRouter><DatabaseResourceRail connections={[personal, team]} selectedId="" onSelect={onSelect} runtime={idleRuntime} /></MemoryRouter>)
  expect(screen.getByRole('button', {name: '连接 Primary'})).toBeVisible()
  expect(screen.getByRole('button', {name: '连接 Team Analytics'})).toBeVisible()
  expect(screen.getByRole('link', {name: '管理连接'})).toHaveAttribute('href', '/connections')
  expect(screen.queryByRole('button', {name: '新建连接'})).not.toBeInTheDocument()
})
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `cd web && npm test -- --run src/features/database/DatabaseResourceRail.test.tsx`

Expected: FAIL because the component is missing.

- [ ] **Step 3: Implement the rail**

Render a search field, personal/team labels from the same array, connection buttons keyed by v2 IDs, connection/runtime status, and the existing object navigation below the active connection. Do not import legacy `SavedConnection`, `ConnectionSidebar`, profile, or team-copy modules.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run: `cd web && npm test -- --run src/features/database/DatabaseResourceRail.test.tsx`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/features/database/DatabaseResourceRail.tsx web/src/features/database/DatabaseResourceRail.test.tsx web/src/features/database/database-workbench.css
git commit -m "feat(database): add unified connection resource rail"
```

### Task 4: Replace the embedded legacy App with the unified database page

**Files:**
- Rewrite: `web/src/pages/DatabasePage.tsx`
- Create: `web/src/pages/DatabasePage.test.tsx`
- Create: `web/src/features/database/DatabaseWorkbench.tsx`
- Create: `web/src/features/database/DatabaseRuntimeContext.tsx`
- Modify: `web/src/pages/ConnectionsPage.tsx`
- Modify: `web/src/pages/ConnectionsPage.test.tsx`
- Move reusable runtime behavior from: `web/src/app/App.tsx`

**Interfaces:**
- Consumes: Task 2 `connectionsClient.list`, `APIClient.connectSaved`, Task 3 resource rail, and existing query/table/schema/MongoDB/Redis feature components.
- Produces: `/database?connection=<v2-id>` page with one connection list and a connected runtime workspace.

- [ ] **Step 1: Write failing page tests**

```tsx
it('lists the connection created in Connection Center', async () => {
  renderDatabase(['/database'], {list: vi.fn(async () => [registryConnection])})
  expect(await screen.findByRole('button', {name: '连接 Primary'})).toBeVisible()
})

it('auto-connects the v2 connection from the URL', async () => {
  const api = fakeWorkbenchAPI()
  renderDatabase(['/database?connection=conn_saved'], {list: vi.fn(async () => [registryConnection])}, api)
  await waitFor(() => expect(api.connectSaved).toHaveBeenCalledWith('conn_saved'))
  expect(await screen.findByText('Primary')).toBeVisible()
})

it('uses Connection Center as the only creation flow', async () => {
  renderDatabase(['/database'], {list: vi.fn(async () => [])})
  expect(await screen.findByRole('link', {name: '前往连接中心'})).toHaveAttribute('href', '/connections')
  expect(screen.queryByRole('dialog', {name: '新建连接'})).not.toBeInTheDocument()
})
```

- [ ] **Step 2: Run the page test and verify RED**

Run: `cd web && npm test -- --run src/pages/DatabasePage.test.tsx`

Expected: FAIL because `DatabasePage` still embeds `App` and reads legacy connections.

- [ ] **Step 3: Implement the new page controller**

`DatabasePage` must create the browser workbench session, fetch `kind=database` v2 records, derive selection from `useSearchParams`, call `connectSaved`, and publish resource/context/status content through the unified-shell hooks. Selecting another connection updates `?connection=<id>` before opening its runtime session.

Use `DatabaseRuntimeContext` to expose only runtime values required by the work area:

```ts
export type DatabaseRuntimeState = {
  target: WorkbenchTarget | null
  connectionId: string
  connected: boolean
  activeDatabase: string
  databases: string[]
  objects: DatabaseObject[]
  error: string
}
```

Move the query tabs, transactions, metadata, table/schema views, MongoDB views, Redis views, history, and export behavior from `App` into `DatabaseWorkbench`. Remove all imports and state for nickname profile, local saved connections, legacy team copying, connection dialogs, and the legacy shell.

- [ ] **Step 4: Verify the page and retained feature tests GREEN**

Run:

```bash
cd web
npm test -- --run src/pages/DatabasePage.test.tsx src/features/table/TableView.test.tsx src/features/schema/SchemaWorkspace.test.tsx src/features/redis src/features/mongo
```

Expected: PASS; the page tests show v2 IDs and retained feature tests remain green.

- [ ] **Step 5: Commit**

```bash
git add web/src/pages/DatabasePage.tsx web/src/pages/DatabasePage.test.tsx web/src/pages/ConnectionsPage.tsx web/src/pages/ConnectionsPage.test.tsx web/src/features/database
git commit -m "feat(database): rebuild workbench on unified connections"
```

### Task 5: Delete the legacy connection and workbench stack

**Files:**
- Delete: `web/src/app/App.tsx`
- Delete: `web/src/app/App.test.tsx`
- Delete: `web/src/features/connections/ConnectionSidebar.tsx`
- Delete: `web/src/features/connections/ConnectionSidebar.test.tsx`
- Delete: `web/src/features/connections/ConnectionDialog.tsx`
- Delete: `web/src/features/connections/ProfileDialog.tsx`
- Delete: `web/src/features/connections/TeamConnectionsDialog.tsx`
- Delete: `web/src/features/connections/TeamConnectionsDialog.test.tsx`
- Delete: `web/src/features/connections/ConnectionProvider.tsx`
- Delete: `web/src/features/connections/ConnectionProvider.test.tsx`
- Delete: `web/src/storage/connections.ts`
- Delete: `web/src/storage/connections.test.ts`
- Delete: `web/src/storage/connectionSync.ts`
- Delete: `web/src/storage/connectionRegistryApi.ts`
- Delete: `web/src/storage/registryTypes.ts`
- Delete: `web/src/storage/teamConnectionMatch.ts`
- Delete: `web/src/storage/teamConnectionMatch.test.ts`
- Delete: `web/src/storage/profile.ts`
- Delete: `web/src/storage/profile.test.ts`
- Delete: `web/src/crypto/vault.ts`
- Delete: `web/src/crypto/vault.test.ts`
- Delete: `api/internal/httpapi/registry_handlers.go`
- Delete: `api/internal/registry/store.go`
- Delete: `api/internal/registry/store_test.go`
- Delete: `api/internal/registry/crypto.go`
- Modify: `api/internal/httpapi/router.go`
- Modify: `api/cmd/server/main.go`
- Modify: `api/internal/config/config.go`
- Modify: `api/internal/config/config_test.go`

**Interfaces:**
- Consumes: completed v2 page and saved-session endpoint from Tasks 1-4.
- Produces: a build with no legacy registry route, nickname connection identity, browser connection database, or legacy workbench entrypoint.

- [ ] **Step 1: Add a failing architecture guard**

Create `web/src/app/single-connection-stack.test.ts` that scans production source and rejects legacy markers:

```ts
it('has one connection stack', () => {
  const production = readProductionSources()
  for (const forbidden of [
    '/api/registry/personal/', '/api/registry/team/', 'X-User-Nickname',
    "openDB('database-workbench'", 'syncPersonalConnections', 'ConnectionSidebar',
  ]) expect(production).not.toContain(forbidden)
})
```

Add a Go route test asserting `GET /api/registry/personal/connections` returns 404.

- [ ] **Step 2: Run guards and verify RED**

Run: `cd web && npm test -- --run src/app/single-connection-stack.test.ts && cd ../api && go test ./internal/httpapi -run LegacyRegistry -count=1`

Expected: FAIL because legacy files and routes still exist.

- [ ] **Step 3: Remove legacy files and wiring**

Delete the listed files, remove `Dependencies.Registry`, remove `registerRegistryRoutes`, stop opening the SQLite registry in `main.go`, and remove registry path/secret configuration that has no remaining caller. If schema signing still consumes the old registry secret, replace that input with an explicitly named `OC_SCHEMA_SECRET` config field and cover it in `config_test.go`; do not leave connection-registry naming attached to schema tokens.

- [ ] **Step 4: Run architecture guards and full compilation**

Run:

```bash
cd web
npm test -- --run src/app/single-connection-stack.test.ts
npm run typecheck
cd ../api
go test ./...
```

Expected: PASS and `rg -n '/api/registry/(personal|team)|X-User-Nickname|syncPersonalConnections|openDB\(' api web/src` returns no production matches.

- [ ] **Step 5: Commit**

```bash
git add -A api web/src
git commit -m "refactor: remove legacy connection workbench"
```

### Task 6: Full integration and release verification

**Files:**
- Modify if needed: `scripts/smoke-foundation.mjs`
- Modify: `docs/deployment.md`
- Modify: `design-qa.md`

**Interfaces:**
- Consumes: the completed unified stack.
- Produces: repeatable proof that create → list → open workspace uses the same v2 connection.

- [ ] **Step 1: Extend the smoke path**

Add a non-secret smoke assertion that authenticates, creates or locates a disposable v2 database connection fixture, verifies it appears in the v2 list, calls its session endpoint against an allowed test database, and deletes the fixture in cleanup. Never print the fixture secret.

- [ ] **Step 2: Run fresh backend tests with PostgreSQL**

Run the isolated PostgreSQL container workflow and:

`OC_TEST_DATABASE_URL='<temporary URL>' go test -count=1 ./...`

Expected: all Go tests PASS, including authorization and encrypted-secret use.

- [ ] **Step 3: Run fresh frontend verification**

Run:

```bash
cd web
npm test -- --run
npm run typecheck
npm run build
```

Expected: all test files PASS; typecheck succeeds; Vite production build succeeds with only the documented chunk-size warning if unchanged.

- [ ] **Step 4: Browser smoke and responsive QA**

Start the API and Vite app, then verify at 390, 1024, and 1440 pixels:

1. create a database connection in `/connections`;
2. click “打开工作台”;
3. confirm the same name appears selected in `/database?connection=<id>`;
4. confirm the runtime session connects and metadata loads;
5. confirm no console errors and no legacy creation/profile UI appears.

Record the final result and screenshots in `design-qa.md`.

- [ ] **Step 5: Commit verification documentation**

```bash
git add scripts/smoke-foundation.mjs docs/deployment.md design-qa.md
git commit -m "test: verify unified connection workbench"
```

- [ ] **Step 6: Merge and deploy**

After pre-landing review, fast-forward the branch into `main`, push without force, update the server checkout, rebuild with the existing Docker Compose environment, and verify `GET /health/ready` plus the browser smoke path. If SSH authentication is still unavailable, stop after the verified `main` push and report the exact credential blocker rather than claiming deployment.
