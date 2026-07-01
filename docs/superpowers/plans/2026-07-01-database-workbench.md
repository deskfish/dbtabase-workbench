# Database Workbench Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a deployable anonymous web workbench that connects from the server to user-supplied MySQL and PostgreSQL databases, securely stores credentials in the browser, and supports browsing, querying, editing, transactions, history, and CSV export.

**Architecture:** A React + TypeScript SPA talks to a Go HTTP API through one origin. The API validates every database destination, keeps credentials and database handles only in memory behind anonymous session and connection IDs, and exposes bounded metadata/query/transaction/export operations. Browser persistence uses IndexedDB with PBKDF2/AES-GCM encryption; Docker Compose packages the SPA, API, reverse proxy, and optional integration-test databases.

**Tech Stack:** Go, `net/http`, `database/sql`, `go-sql-driver/mysql`, `pgx` stdlib, React, TypeScript, Vite, Monaco Editor, TanStack Virtual, Vitest, Testing Library, Playwright, Docker Compose, Caddy.

## Global Constraints

- Support MySQL and PostgreSQL; the server directly connects to database hosts reachable from its network.
- Do not implement registration, login, users, organizations, shared connections, SSH tunnels, ER modeling, backup/restore, or cloud credential persistence.
- Never persist database passwords on the server or include passwords, connection strings, or SQL parameter values in logs.
- Browser passwords must use PBKDF2-SHA-256 with a random 16-byte salt and 600,000 iterations, then AES-256-GCM with a random 12-byte IV.
- Lock the browser vault after 15 minutes of inactivity and keep the derived key only in page memory.
- Default query timeout is 30 seconds, page size is 200 rows, and one query may read at most 10,000 rows.
- Production database destinations are denied unless allowed by configured CIDRs/domain suffixes and ports; resolved IPs must be revalidated.
- The UI must be keyboard-operable, show visible focus, and respect `prefers-reduced-motion`.
- Follow test-first development: every behavior change begins with a failing test that is observed before production code is written.

---

## File map

```text
api/
  cmd/server/main.go                 composition root and graceful shutdown
  internal/config/config.go          environment parsing and defaults
  internal/httpapi/router.go         routes, middleware, JSON error contract
  internal/network/policy.go         hostname, IP, CIDR, suffix, and port validation
  internal/session/store.go          anonymous sessions and in-memory DB handles
  internal/db/driver.go              MySQL/PostgreSQL opening and dialect helpers
  internal/db/metadata.go            schemas, tables, columns, indexes
  internal/query/service.go          bounded execution, paging, cancellation, export
  internal/query/risk.go             destructive-statement classification
  internal/table/service.go          parameterized single-row mutations
  internal/testdb/testdb.go          integration database helpers
web/
  src/api/client.ts                  typed API client and error mapping
  src/crypto/vault.ts                Web Crypto envelope format
  src/storage/connections.ts         IndexedDB persistence
  src/features/connections/*         connect/unlock/lock UI and state
  src/features/explorer/*            metadata object tree
  src/features/editor/*              tabs, Monaco, query actions, risk confirmation
  src/features/results/*             virtualized grid and CSV download
  src/features/table/*               stable paging and row edits
  src/features/history/*             local history and favorites
  src/app/*                           shell, tokens, layout, accessibility
deploy/                              Caddy, containers, Compose, environment example
tests/e2e/                            browser acceptance tests
```

### Task 1: Repository skeleton, configuration, and health API

**Files:**
- Create: `go.work`, `Makefile`, `.gitignore`, `api/go.mod`, `api/cmd/server/main.go`
- Create: `api/internal/config/config.go`, `api/internal/config/config_test.go`
- Create: `api/internal/httpapi/router.go`, `api/internal/httpapi/router_test.go`
- Create: `web/package.json`, `web/tsconfig.json`, `web/vite.config.ts`, `web/index.html`, `web/src/main.tsx`

**Interfaces:**
- Produces: `config.Load(getenv func(string) string) (config.Config, error)`.
- Produces: `httpapi.NewRouter(httpapi.Dependencies) http.Handler` with `GET /health/live` and `GET /health/ready`.

- [ ] **Step 1: Write failing configuration and health tests**

```go
func TestLoadDefaults(t *testing.T) {
  cfg, err := Load(func(string) string { return "" })
  if err != nil { t.Fatal(err) }
  if cfg.QueryTimeout != 30*time.Second || cfg.PageSize != 200 || cfg.MaxRows != 10000 {
    t.Fatalf("unexpected defaults: %+v", cfg)
  }
}

func TestHealthEndpoints(t *testing.T) {
  h := NewRouter(Dependencies{Ready: func() bool { return true }})
  for _, path := range []string{"/health/live", "/health/ready"} {
    rr := httptest.NewRecorder()
    h.ServeHTTP(rr, httptest.NewRequest(http.MethodGet, path, nil))
    if rr.Code != http.StatusOK { t.Fatalf("%s: %d", path, rr.Code) }
  }
}
```

- [ ] **Step 2: Run tests and observe missing packages**

Run: `cd api && go test ./internal/config ./internal/httpapi`
Expected: FAIL because `Load` and `NewRouter` do not exist.

- [ ] **Step 3: Implement the minimal config and router**

```go
type Config struct {
  Address string
  QueryTimeout time.Duration
  PageSize, MaxRows int
}

func Load(getenv func(string) string) (Config, error) {
  return Config{Address: ":8080", QueryTimeout: 30*time.Second, PageSize: 200, MaxRows: 10000}, nil
}

func NewRouter(d Dependencies) http.Handler {
  mux := http.NewServeMux()
  mux.HandleFunc("GET /health/live", func(w http.ResponseWriter, _ *http.Request) { writeJSON(w, 200, map[string]string{"status":"ok"}) })
  mux.HandleFunc("GET /health/ready", func(w http.ResponseWriter, _ *http.Request) {
    if !d.Ready() { writeJSON(w, 503, map[string]string{"status":"not_ready"}); return }
    writeJSON(w, 200, map[string]string{"status":"ok"})
  })
  return mux
}
```

- [ ] **Step 4: Add the Go composition root and minimal Vite React shell, then verify**

Run: `cd api && go test ./... && cd ../web && npm install && npm run build`
Expected: Go tests PASS and Vite build exits 0.

- [ ] **Step 5: Commit the runnable skeleton**

```bash
git add .gitignore Makefile go.work api web
git commit -m "chore: scaffold database workbench"
```

### Task 2: Database destination policy and in-memory sessions

**Files:**
- Create: `api/internal/network/policy.go`, `api/internal/network/policy_test.go`
- Create: `api/internal/session/store.go`, `api/internal/session/store_test.go`
- Modify: `api/internal/config/config.go`

**Interfaces:**
- Produces: `(*network.Policy).Validate(ctx context.Context, host string, port uint16) ([]netip.Addr, error)`.
- Produces: `session.NewStore(idle time.Duration) *Store`, `CreateSession() string`, `Put(sessionID string, db *sql.DB) string`, `Get(sessionID, connectionID string) (*sql.DB, bool)`, `Delete`, and `CloseIdle`.

- [ ] **Step 1: Write failing SSRF and session lifecycle tests**

```go
func TestPolicyRejectsResolvedAddressOutsideAllowlist(t *testing.T) {
  p := Policy{AllowedCIDRs: mustPrefixes("10.20.0.0/16"), Resolve: func(context.Context,string)([]netip.Addr,error) {
    return []netip.Addr{netip.MustParseAddr("169.254.169.254")}, nil
  }}
  if _, err := p.Validate(context.Background(), "db.internal", 3306); err == nil { t.Fatal("expected rejection") }
}

func TestStoreScopesConnectionToSession(t *testing.T) {
  s := NewStore(30*time.Minute)
  owner, other := s.CreateSession(), s.CreateSession()
  id := s.Put(owner, &sql.DB{})
  if _, ok := s.Get(other, id); ok { t.Fatal("cross-session access") }
}
```

- [ ] **Step 2: Run tests and observe expected failures**

Run: `cd api && go test ./internal/network ./internal/session`
Expected: FAIL because policy and store are undefined.

- [ ] **Step 3: Implement resolution-time allowlist validation and opaque session IDs**

```go
type Policy struct {
  AllowedCIDRs []netip.Prefix
  AllowedPorts map[uint16]struct{}
  AllowedSuffixes []string
  Resolve func(context.Context, string) ([]netip.Addr, error)
}

type Store struct {
  mu sync.RWMutex
  idle time.Duration
  sessions map[string]map[string]*entry
}
```

Generate IDs using `crypto/rand` with 32 random bytes encoded as base64url. Reject loopback, unspecified, multicast, link-local, private IPs outside configured CIDRs, disallowed ports, empty DNS results, and any resolved address outside the allowlist. Re-check every resolved IP before dialing.

- [ ] **Step 4: Verify race safety and policy behavior**

Run: `cd api && go test -race ./internal/network ./internal/session`
Expected: PASS with no race report.

- [ ] **Step 5: Commit the security boundary**

```bash
git add api/internal/config api/internal/network api/internal/session
git commit -m "feat: enforce database destination policy"
```

### Task 3: Database connections and metadata API

**Files:**
- Create: `api/internal/db/driver.go`, `api/internal/db/driver_test.go`
- Create: `api/internal/db/metadata.go`, `api/internal/db/metadata_integration_test.go`
- Create: `api/internal/testdb/testdb.go`
- Modify: `api/internal/httpapi/router.go`, `api/internal/httpapi/router_test.go`

**Interfaces:**
- Consumes: `network.Policy.Validate`, `session.Store`.
- Produces: `db.Open(ctx, ConnectionInput) (*sql.DB, error)` and `db.Metadata(ctx, *sql.DB, Driver, MetadataRequest) ([]Object, error)`.
- Produces: `POST /api/sessions`, `POST /api/connections`, `DELETE /api/connections/{id}`, `GET /api/connections/{id}/metadata`.

- [ ] **Step 1: Write failing DSN, redaction, and API contract tests**

```go
func TestConnectionErrorDoesNotExposePassword(t *testing.T) {
  _, err := Open(context.Background(), ConnectionInput{Driver:"mysql", Host:"127.0.0.1", Port:1, User:"u", Password:"topsecret"})
  if err == nil || strings.Contains(err.Error(), "topsecret") { t.Fatalf("unsafe error: %v", err) }
}

func TestCreateConnectionRequiresSession(t *testing.T) {
  rr := requestJSON(NewRouter(testDependencies()), "POST", "/api/connections", `{}`)
  if rr.Code != http.StatusUnauthorized { t.Fatalf("got %d", rr.Code) }
}
```

- [ ] **Step 2: Run focused tests and observe failure**

Run: `cd api && go test ./internal/db ./internal/httpapi -run 'Connection|Metadata'`
Expected: FAIL because connection endpoints and driver adapters are absent.

- [ ] **Step 3: Implement typed connection input, driver adapters, and metadata queries**

```go
type ConnectionInput struct {
  Driver string `json:"driver"`
  Host string `json:"host"`
  Port uint16 `json:"port"`
  Database string `json:"database"`
  User string `json:"user"`
  Password string `json:"password"`
  TLSMode string `json:"tlsMode"`
}

type Object struct {
  Kind, Catalog, Schema, Name, Parent string
  Nullable bool
  DataType string
}
```

Use `mysql.NewConfig()` for MySQL DSNs and `pgx.ParseConfig()` for PostgreSQL. Ping with a bounded context before storing the handle. Query `information_schema` with driver-specific SQL and deterministic ordering.

- [ ] **Step 4: Run integration tests against disposable MySQL and PostgreSQL**

Run: `docker compose -f deploy/compose.test.yml up -d --wait && cd api && TEST_DATABASES=1 go test ./internal/db -run Integration -count=1`
Expected: PASS for both database engines.

- [ ] **Step 5: Commit connections and metadata**

```bash
git add api/internal/db api/internal/httpapi api/internal/testdb deploy/compose.test.yml
git commit -m "feat: connect and inspect mysql and postgres"
```

### Task 4: Query execution, cancellation, risk detection, and CSV export

**Files:**
- Create: `api/internal/query/risk.go`, `api/internal/query/risk_test.go`
- Create: `api/internal/query/service.go`, `api/internal/query/service_test.go`, `api/internal/query/service_integration_test.go`
- Modify: `api/internal/httpapi/router.go`, `api/internal/httpapi/router_test.go`

**Interfaces:**
- Produces: `query.Classify(sql string) Risk` where `Risk` contains `Level`, `Kind`, `Target`, and `Reason`.
- Produces: `Service.Start`, `Service.Page`, `Service.Cancel`, `Service.ExportCSV`, with query IDs scoped to session and connection.
- Produces: query start/page/cancel/export HTTP endpoints.

- [ ] **Step 1: Write failing classification and bounded-result tests**

```go
func TestClassifyDeleteWithoutTopLevelWhere(t *testing.T) {
  r := Classify("DELETE FROM invoices")
  if r.Level != Confirm || r.Kind != "delete_without_where" { t.Fatalf("%+v", r) }
}

func TestClassifyIgnoresWhereInsideSubquery(t *testing.T) {
  r := Classify("DELETE FROM invoices WHERE id IN (SELECT id FROM old WHERE done=1)")
  if r.Level != Safe { t.Fatalf("%+v", r) }
}
```

```go
func TestPageStopsAtConfiguredSize(t *testing.T) {
  svc := NewService(Limits{PageSize: 200, MaxRows: 10000, Timeout: 30*time.Second})
  page := runFakeRows(t, svc, 201)
  if len(page.Rows) != 200 || page.NextCursor == "" { t.Fatalf("%+v", page) }
}

func TestCancelClosesRunningJob(t *testing.T) {
  svc, started, canceled := serviceWithBlockingQuery(t)
  id := startBlockingQuery(t, svc)
  <-started
  if err := svc.Cancel(testScope, id); err != nil { t.Fatal(err) }
  select { case <-canceled: case <-time.After(time.Second): t.Fatal("query was not canceled") }
}
```

Create `fakeRows` in `service_test.go` implementing the internal row iterator so the same tests assert the 10,000-row cap, typed null encoding, and that captured logs contain neither SQL parameters nor connection credentials.

- [ ] **Step 2: Run tests and observe classification/result failures**

Run: `cd api && go test ./internal/query ./internal/httpapi -run 'Classify|Query|Cancel|Export'`
Expected: FAIL because query services are undefined.

- [ ] **Step 3: Implement tokenizer-based risk checks and bounded query jobs**

```go
type ResultPage struct {
  QueryID string `json:"queryId"`
  Columns []Column `json:"columns"`
  Rows [][]Cell `json:"rows"`
  NextCursor string `json:"nextCursor,omitempty"`
  AffectedRows int64 `json:"affectedRows,omitempty"`
  DurationMS int64 `json:"durationMs"`
  Truncated bool `json:"truncated"`
}
```

Tokenize SQL while skipping strings, quoted identifiers, dollar-quoted PostgreSQL bodies, and comments. Track parenthesis depth so only a top-level `WHERE` satisfies update/delete safety. Use `context.WithTimeout`, a per-session semaphore, random query IDs, and a synchronized job registry. Stream CSV with RFC 4180 escaping and a UTF-8 BOM for spreadsheet compatibility.

- [ ] **Step 4: Verify query behavior on both engines**

Run: `cd api && TEST_DATABASES=1 go test -race ./internal/query ./internal/httpapi -count=1`
Expected: PASS; a deliberate long-running query is canceled on both engines.

- [ ] **Step 5: Commit query execution**

```bash
git add api/internal/query api/internal/httpapi
git commit -m "feat: execute bounded cancellable queries"
```

### Task 5: Transactions and safe table mutations

**Files:**
- Create: `api/internal/table/service.go`, `api/internal/table/service_test.go`, `api/internal/table/service_integration_test.go`
- Create: `api/internal/query/transaction.go`, `api/internal/query/transaction_test.go`
- Modify: `api/internal/httpapi/router.go`, `api/internal/httpapi/router_test.go`

**Interfaces:**
- Produces: `Begin`, `Commit`, and `Rollback` using opaque transaction IDs scoped to one session/connection.
- Produces: `table.List`, `table.Insert`, `table.Update`, `table.Delete` with driver-specific identifier quoting and parameter binding.

- [ ] **Step 1: Write failing quoting and affected-row tests**

```go
func TestQuoteIdentifier(t *testing.T) {
  if got := QuoteIdentifier(MySQL, "odd`name"); got != "`odd``name`" { t.Fatal(got) }
  if got := QuoteIdentifier(Postgres, `odd"name`); got != `"odd""name"` { t.Fatal(got) }
}

func TestUpdateRequiresUniqueKey(t *testing.T) {
  _, err := BuildUpdate(Postgres, Mutation{Table:"events", Values:map[string]any{"name":"x"}})
  if !errors.Is(err, ErrUniqueKeyRequired) { t.Fatalf("%v", err) }
}
```

- [ ] **Step 2: Run focused tests and observe failure**

Run: `cd api && go test ./internal/table ./internal/query -run 'Quote|Unique|Transaction'`
Expected: FAIL because mutation and transaction services do not exist.

- [ ] **Step 3: Implement transaction registry and parameterized mutations**

```go
type Mutation struct {
  Schema string `json:"schema"`
  Table string `json:"table"`
  Values map[string]any `json:"values"`
  Key map[string]any `json:"key"`
}
```

Obtain primary/unique key metadata before enabling writes. Generate placeholders as `?` for MySQL and `$1..$n` for PostgreSQL. Reject zero or multiple affected rows and roll back the operation. Auto-rollback idle transactions after five minutes and on session deletion.

- [ ] **Step 4: Verify rollback, commit, insert, update, and delete on both engines**

Run: `cd api && TEST_DATABASES=1 go test -race ./internal/table ./internal/query -count=1`
Expected: PASS for MySQL and PostgreSQL.

- [ ] **Step 5: Commit safe writes**

```bash
git add api/internal/table api/internal/query api/internal/httpapi
git commit -m "feat: add transactions and safe row editing"
```

### Task 6: Browser vault and local connection persistence

**Files:**
- Create: `web/src/crypto/vault.ts`, `web/src/crypto/vault.test.ts`
- Create: `web/src/storage/connections.ts`, `web/src/storage/connections.test.ts`
- Create: `web/src/features/connections/ConnectionProvider.tsx`, `ConnectionProvider.test.tsx`
- Create: `web/src/features/connections/ConnectionDialog.tsx`, `VaultUnlock.tsx`
- Create: `web/src/api/client.ts`, `web/src/api/types.ts`

**Interfaces:**
- Produces: `createVault(password)`, `unlockVault(password, envelope)`, `encryptSecret`, `decryptSecret`, `lock`.
- Produces: IndexedDB CRUD for `SavedConnection` with encrypted password envelopes.
- Produces: typed session/connect/disconnect API client.

- [ ] **Step 1: Write failing cryptography and auto-lock tests**

```ts
it('encrypts without storing plaintext and decrypts with the unlock password', async () => {
  const vault = await createVault('correct horse battery staple')
  const encrypted = await vault.encryptSecret('db-secret')
  expect(JSON.stringify(encrypted)).not.toContain('db-secret')
  const unlocked = await unlockVault('correct horse battery staple', encrypted.kdf)
  await expect(unlocked.decryptSecret(encrypted)).resolves.toBe('db-secret')
})

it('locks after fifteen inactive minutes', async () => {
  vi.useFakeTimers()
  render(<ConnectionProvider><Probe /></ConnectionProvider>)
  await unlockThroughProbe()
  vi.advanceTimersByTime(15 * 60 * 1000)
  expect(screen.getByText('已锁定')).toBeInTheDocument()
})
```

- [ ] **Step 2: Run Vitest and observe missing vault failures**

Run: `cd web && npm test -- src/crypto/vault.test.ts src/features/connections/ConnectionProvider.test.tsx`
Expected: FAIL because vault and provider modules are absent.

- [ ] **Step 3: Implement the versioned encrypted envelope and IndexedDB store**

```ts
export type EncryptedSecret = {
  version: 1
  kdf: { name: 'PBKDF2'; hash: 'SHA-256'; iterations: 600000; salt: string }
  cipher: { name: 'AES-GCM'; iv: string; ciphertext: string }
}
```

Use `crypto.getRandomValues`, `crypto.subtle.deriveKey`, and `crypto.subtle.encrypt/decrypt`. Store only `SavedConnection` records; retain `CryptoKey` in provider state. Reset the inactivity timer on pointer, keyboard, and visibility events, and wipe decrypted secrets from React state immediately after connection.

- [ ] **Step 4: Verify crypto, persistence, type checking, and production build**

Run: `cd web && npm test -- --run && npm run typecheck && npm run build`
Expected: all tests PASS and build exits 0.

- [ ] **Step 5: Commit browser credential storage**

```bash
git add web/src/crypto web/src/storage web/src/features/connections web/src/api
git commit -m "feat: encrypt saved database connections"
```

### Task 7: Workbench shell, object explorer, editor, and results

**Files:**
- Create: `web/src/app/App.tsx`, `web/src/app/App.test.tsx`, `web/src/app/tokens.css`, `web/src/app/workbench.css`
- Create: `web/src/features/explorer/ObjectTree.tsx`, `ObjectTree.test.tsx`
- Create: `web/src/features/editor/EditorTabs.tsx`, `SqlEditor.tsx`, `QueryToolbar.tsx`, `RiskDialog.tsx`, `editor.test.tsx`
- Create: `web/src/features/results/ResultGrid.tsx`, `ResultGrid.test.tsx`, `ExecutionMessage.tsx`
- Modify: `web/src/main.tsx`

**Interfaces:**
- Consumes: typed API client and connection context.
- Produces: complete query flow from selected SQL to result pages, cancellation, risk confirmation, and CSV download.

- [ ] **Step 1: Write failing accessible-workflow tests**

```tsx
it('executes selected SQL and renders returned rows', async () => {
  const api = fakeAPI({rows:[[1,'Ada']], columns:[{name:'id'},{name:'name'}]})
  render(<App api={api} />)
  await userEvent.click(screen.getByRole('button', {name:'执行选中 SQL'}))
  expect(await screen.findByRole('cell', {name:'Ada'})).toBeVisible()
})

it('requires object-name confirmation before DROP', async () => {
  render(<App api={fakeAPI()} initialSQL="DROP TABLE invoices" />)
  await userEvent.click(screen.getByRole('button', {name:'执行选中 SQL'}))
  expect(screen.getByRole('dialog', {name:'确认危险操作'})).toBeVisible()
  expect(fakeAPI().startQuery).not.toHaveBeenCalled()
})
```

- [ ] **Step 2: Run UI tests and observe missing component failures**

Run: `cd web && npm test -- src/app/App.test.tsx src/features/editor/editor.test.tsx`
Expected: FAIL because the workbench components do not exist.

- [ ] **Step 3: Implement the compact dark workbench**

Define centralized CSS tokens for neutral ink surfaces, a restrained cyan connection accent, amber warnings, red destructive actions, 4/8/12/16/24 spacing, 6px radii, visible focus rings, and 120–180ms motion. The signature interaction is a thin connection-status rail that visually links the active connection, editor tab, and result panel without decorative gradients.

Use semantic buttons, tree roles with arrow-key navigation, labelled split panes, lazy Monaco loading, keyboard shortcuts (`Ctrl/Cmd+Enter` execute, `Esc` cancel), TanStack Virtual rows, and an `aria-live` execution summary. Collapse the object tree into a drawer below 800px and preserve editor/result resizing.

- [ ] **Step 4: Verify tests, build, and accessibility smoke checks**

Run: `cd web && npm test -- --run && npm run typecheck && npm run build`
Expected: PASS with no React act warnings or TypeScript errors.

- [ ] **Step 5: Commit the query workbench**

```bash
git add web/src/app web/src/features/explorer web/src/features/editor web/src/features/results web/src/main.tsx
git commit -m "feat: build database query workbench"
```

### Task 8: Table editor, history, favorites, and unsaved transaction guard

**Files:**
- Create: `web/src/features/table/TableView.tsx`, `TableView.test.tsx`, `RowEditor.tsx`
- Create: `web/src/features/history/store.ts`, `store.test.ts`, `HistoryPanel.tsx`
- Create: `web/src/features/editor/useTransaction.ts`, `useTransaction.test.tsx`
- Modify: `web/src/app/App.tsx`, `web/src/features/explorer/ObjectTree.tsx`

**Interfaces:**
- Consumes: table and transaction API endpoints.
- Produces: stable-key row paging/editing, local SQL history/favorites, begin/commit/rollback, and page-leave protection.

- [ ] **Step 1: Write failing row-edit and transaction-guard tests**

```tsx
it('keeps a keyless table read-only', async () => {
  render(<TableView table={tableWithoutUniqueKey} api={fakeAPI()} />)
  expect(screen.getByText('此表没有主键或唯一键，仅支持只读浏览')).toBeVisible()
  expect(screen.queryByRole('button', {name:'编辑行'})).not.toBeInTheDocument()
})

it('warns before leaving with an open transaction', () => {
  const {result} = renderHook(() => useTransaction(fakeAPI()))
  act(() => result.current.markOpen('tx-1'))
  const event = new BeforeUnloadEvent('beforeunload', {cancelable:true})
  window.dispatchEvent(event)
  expect(event.defaultPrevented).toBe(true)
})
```

- [ ] **Step 2: Run tests and observe missing feature failures**

Run: `cd web && npm test -- src/features/table src/features/history src/features/editor/useTransaction.test.tsx`
Expected: FAIL because table/history/transaction modules are absent.

- [ ] **Step 3: Implement edits, browser-only history, favorites, and transaction controls**

Persist history records containing only SQL text, connection alias, database/schema, timestamp, duration, status, and affected rows. Cap history at 500 entries per browser. Require a review panel before insert/update/delete; show generated operation metadata but never concatenate values into SQL in the browser. Disable editing when unique-key metadata is absent.

- [ ] **Step 4: Verify all frontend behavior**

Run: `cd web && npm test -- --run && npm run typecheck && npm run build`
Expected: PASS.

- [ ] **Step 5: Commit data maintenance features**

```bash
git add web/src/features/table web/src/features/history web/src/features/editor web/src/app/App.tsx web/src/features/explorer/ObjectTree.tsx
git commit -m "feat: add table editing history and transactions"
```

### Task 9: Deployment hardening, end-to-end tests, and operating documentation

**Files:**
- Create: `api/Dockerfile`, `web/Dockerfile`, `deploy/Caddyfile`, `deploy/compose.yml`, `deploy/.env.example`
- Create: `tests/e2e/package.json`, `tests/e2e/playwright.config.ts`, `tests/e2e/workbench.spec.ts`
- Create: `README.md`, `docs/deployment.md`, `docs/security.md`
- Modify: `api/cmd/server/main.go`, `api/internal/httpapi/router.go`, `Makefile`

**Interfaces:**
- Produces: production containers running as non-root with read-only filesystems, TLS reverse proxy, security headers, health checks, graceful shutdown, and documented environment configuration.
- Produces: one-command verification through `make verify`.

- [ ] **Step 1: Write failing browser acceptance and security-header tests**

```ts
test('connects, queries, edits a row, exports CSV, and disconnects', async ({page}) => {
  await page.goto('/')
  await page.getByRole('button', {name:'新建连接'}).click()
  await fillTestPostgresConnection(page)
  await page.getByRole('button', {name:'连接'}).click()
  await expect(page.getByText('已连接')).toBeVisible()
  await page.getByRole('textbox', {name:'SQL 编辑器'}).fill('select 1 as value')
  await page.getByRole('button', {name:'执行选中 SQL'}).click()
  await expect(page.getByRole('cell', {name:'1'})).toBeVisible()
})
```

```go
func TestSecurityHeadersAndRequestID(t *testing.T) {
  rr := httptest.NewRecorder()
  NewRouter(testDependencies()).ServeHTTP(rr, httptest.NewRequest("GET", "/health/live", nil))
  for name, want := range map[string]string{
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
  } {
    if got := rr.Header().Get(name); got != want { t.Fatalf("%s=%q", name, got) }
  }
  if rr.Header().Get("Content-Security-Policy") == "" || rr.Header().Get("X-Request-ID") == "" {
    t.Fatal("missing CSP or request id")
  }
}

func TestJSONBodyLimit(t *testing.T) {
  body := strings.NewReader(`{"sql":"` + strings.Repeat("x", 2<<20) + `"}`)
  rr := httptest.NewRecorder()
  NewRouter(testDependencies()).ServeHTTP(rr, httptest.NewRequest("POST", "/api/query", body))
  if rr.Code != http.StatusRequestEntityTooLarge { t.Fatalf("got %d", rr.Code) }
}
```

- [ ] **Step 2: Run end-to-end and security tests and observe failure**

Run: `docker compose -f deploy/compose.yml up -d --build --wait && cd tests/e2e && npm install && npx playwright test`
Expected: FAIL until deployment wiring, test fixtures, and headers are complete.

- [ ] **Step 3: Implement hardened containers, proxy, graceful shutdown, and docs**

Use multi-stage images; run API and web containers as numeric non-root users; mount no writable application volumes; set `read_only: true`, `cap_drop: [ALL]`, `security_opt: [no-new-privileges:true]`, memory/CPU limits, and tmpfs only where required. Configure Caddy with a CSP that permits only self-hosted assets and Monaco workers. Document CIDR/port policy, TLS, database least-privilege accounts, log retention, upgrades, backups of browser-exported connection profiles, and incident response.

- [ ] **Step 4: Run the full verification matrix**

Run: `make verify`
Expected: Go unit/integration tests, race tests, frontend tests, TypeScript, production builds, Playwright, Compose health checks, and container configuration checks all PASS.

- [ ] **Step 5: Perform manual release smoke test and commit**

Run: `docker compose -f deploy/compose.yml ps && curl -fsS http://localhost/health/ready`
Expected: every service is healthy and the endpoint returns `{"status":"ok"}`.

```bash
git add api web deploy tests README.md docs Makefile
git commit -m "feat: package production database workbench"
```

## Plan self-review

- Every design requirement maps to Tasks 2–9; explicit exclusions remain excluded.
- Shared identifiers are consistent: anonymous session ID scopes connection IDs; connection IDs scope query and transaction IDs.
- Browser persistence, server memory-only credentials, network allowlists, dangerous SQL confirmation, resource bounds, writes, transactions, exports, accessibility, tests, and deployment all have explicit verification steps.
- No implementation task depends on an undefined later interface.
