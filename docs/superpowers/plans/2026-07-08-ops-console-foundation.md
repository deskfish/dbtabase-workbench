# Ops Console Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first independently testable Ops Console milestone: preserve both source baselines, run one authenticated React/Go application with PostgreSQL and Redis, and manage encrypted personal/team database and SSH connection records from one connection center.

**Architecture:** Keep `database-workbench` as the implementation repository. Add PostgreSQL-backed identity and connection-registry modules plus Redis-backed login sessions to the existing Go process, wrap the existing database workbench in a routed React shell, and embed the Vite build into the Go binary. The legacy database runtime session and SQLite registry remain compatibility-only until the next plan; this milestone does not port Log Lens business APIs.

**Tech Stack:** Go 1.25, `net/http`, pgx v5, go-redis v9, Argon2id, AES-256-GCM, React 19, TypeScript 5.8, Vite 7, React Router, Vitest, Testing Library, Docker Compose, PostgreSQL 16, Redis 7.

## Global Constraints

- Final product name is **Ops Console** and the repository is renamed to `ops-console` only after full cutover.
- Runtime exposes one application image, one Go application process, and one port; Node exists only in the image build stage.
- PostgreSQL and Redis are dependency services managed by the same Docker Compose file.
- Saved database and SSH credentials are encrypted on the server and are never returned by list/detail APIs.
- Users authenticate with local accounts; personal and team connection authorization is enforced by Go, not by hidden UI controls.
- Use the approved light engineering workbench tokens; database editors may retain dark task surfaces.
- Preserve all current Database Workbench behavior and all current `log-lens` working-tree changes.
- Do not delete the legacy SQLite registry, browser IndexedDB connections, `log-lens` PostgreSQL data, or uploaded files in this milestone.
- Keep legacy database runtime and SQLite registry routes temporarily available behind login. The next plan replaces their connection source with the unified registry.
- Every task follows red-green-refactor, runs the narrow test first, runs the relevant suite, and ends in a focused commit.

---

## Planned File Structure

- `scripts/capture-migration-baseline.sh` preserves HEAD, status, binary diff, and untracked files from both repositories.
- `api/internal/platform/` owns PostgreSQL and Redis clients.
- `api/internal/migrate/` owns embedded ordered PostgreSQL migrations.
- `api/internal/identity/` owns password hashes, users, teams, principals, and Redis sessions.
- `api/internal/registry/model.go`, `keyring.go`, and `postgres_store.go` add the unified encrypted registry while `store.go` remains legacy-compatible.
- `api/internal/httpapi/auth_*` and `connection_handlers.go` expose authenticated APIs.
- `api/internal/webui/` embeds and serves the React SPA.
- `web/src/auth/`, `layout/`, `connections/`, and `pages/` implement the routed shell, login, settings, and connection center.
- Root `Dockerfile`, `deploy/compose.yml`, and `Makefile` produce and verify one application container.

### Task 1: Capture Non-Destructive Source Baselines

**Files:**
- Create: `scripts/capture-migration-baseline.sh`
- Modify: `.gitignore`

**Interfaces:**
- Consumes: sibling repositories `database-workbench` and `log-lens`.
- Produces: `.migration-snapshots/<timestamp>/<repo>/head.txt`, `status.txt`, `working-tree.patch`, `untracked.list`, and `untracked-files.tgz`.

- [ ] **Step 1: Confirm the safety script is absent**

Run: `test -x scripts/capture-migration-baseline.sh`

Expected: exit status `1`.

- [ ] **Step 2: Exclude local snapshot archives**

Append to `.gitignore`:

```gitignore
.migration-snapshots/
```

- [ ] **Step 3: Implement the capture script**

```bash
#!/usr/bin/env bash
set -euo pipefail

workspace="${1:-$(cd "$(dirname "$0")/../.." && pwd)}"
destination="${2:-$workspace/database-workbench/.migration-snapshots/$(date +%Y%m%d-%H%M%S)}"

capture_repo() {
  local name="$1"
  local repo="$workspace/$name"
  local out="$destination/$name"
  test -d "$repo/.git"
  mkdir -p "$out"
  git -C "$repo" rev-parse HEAD > "$out/head.txt"
  git -C "$repo" branch --show-current > "$out/branch.txt"
  git -C "$repo" status --porcelain=v2 --branch > "$out/status.txt"
  git -C "$repo" diff --binary HEAD > "$out/working-tree.patch"
  git -C "$repo" ls-files --others --exclude-standard > "$out/untracked.list"
  tar -C "$repo" -czf "$out/untracked-files.tgz" -T "$out/untracked.list"
}

mkdir -p "$destination"
capture_repo database-workbench
capture_repo log-lens
printf '%s\n' "$destination"
```

- [ ] **Step 4: Verify the live workspace remains unchanged**

```bash
chmod +x scripts/capture-migration-baseline.sh
snapshot_dir=$(scripts/capture-migration-baseline.sh /Users/sunlacey/codeSpace/personal/devComponent)
test -s "$snapshot_dir/log-lens/head.txt"
test -s "$snapshot_dir/log-lens/status.txt"
test -s "$snapshot_dir/log-lens/working-tree.patch"
git -C ../log-lens status --short
```

Expected: all checks pass and the existing `log-lens` changes remain visible.

- [ ] **Step 5: Commit**

```bash
git add .gitignore scripts/capture-migration-baseline.sh
git commit -m "chore: preserve consolidation source baselines"
```

### Task 2: Add Required Platform Configuration and Resources

**Files:**
- Modify: `api/internal/config/config.go`
- Modify: `api/internal/config/config_test.go`
- Create: `api/internal/platform/resources.go`
- Create: `api/internal/platform/resources_test.go`
- Modify: `api/go.mod`
- Modify: `api/go.sum`

**Interfaces:**
- Produces: `Config.PostgresURL`, `RedisURL`, `CredentialKeys`, `ActiveCredentialKey`, `CookieSecure`, `SessionTTL`, `BootstrapAdminUser`, and `BootstrapAdminPassword`.
- Produces: `platform.Open(ctx, postgresURL, redisURL) (*Resources, error)`, `(*Resources).Ready(ctx) bool`, and `(*Resources).Close()`.

- [ ] **Step 1: Write failing configuration tests**

```go
func TestLoadOpsConsolePlatform(t *testing.T) {
  values := map[string]string{
    "OC_DATABASE_URL": "postgres://ops:secret@localhost:5432/ops",
    "OC_REDIS_URL": "redis://localhost:6379/0",
    "OC_CREDENTIAL_KEYS": "v1:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
    "OC_ACTIVE_CREDENTIAL_KEY": "v1",
    "OC_COOKIE_SECURE": "false",
    "OC_SESSION_TTL": "12h",
  }
  cfg, err := Load(func(key string) string { return values[key] })
  if err != nil { t.Fatal(err) }
  if cfg.PostgresURL != values["OC_DATABASE_URL"] || cfg.RedisURL != values["OC_REDIS_URL"] { t.Fatalf("unexpected URLs: %+v", cfg) }
  if cfg.ActiveCredentialKey != "v1" || cfg.CookieSecure || cfg.SessionTTL != 12*time.Hour { t.Fatalf("unexpected config: %+v", cfg) }
}

func TestLoadRejectsMissingCredentialKey(t *testing.T) {
  _, err := Load(func(key string) string {
    values := map[string]string{"OC_DATABASE_URL":"postgres://ops@localhost/ops", "OC_REDIS_URL":"redis://localhost:6379/0"}
    return values[key]
  })
  if err == nil { t.Fatal("expected missing credential key error") }
}
```

- [ ] **Step 2: Run the tests and confirm red**

Run: `cd api && go test ./internal/config -run 'TestLoadOpsConsole|TestLoadRejectsMissing' -v`

Expected: FAIL because the new fields do not exist.

- [ ] **Step 3: Implement exact configuration fields**

```go
type Config struct {
  Address string
  QueryTimeout time.Duration
  PageSize int
  MaxRows int
  AllowedCIDRs []netip.Prefix
  AllowedPorts map[uint16]struct{}
  AllowedSuffixes []string
  RegistryPath string
  RegistrySecret string
  PostgresURL string
  RedisURL string
  CredentialKeys string
  ActiveCredentialKey string
  CookieSecure bool
  SessionTTL time.Duration
  BootstrapAdminUser string
  BootstrapAdminPassword string
}
```

Require non-empty `OC_DATABASE_URL`, `OC_REDIS_URL`, `OC_CREDENTIAL_KEYS`, and `OC_ACTIVE_CREDENTIAL_KEY`. Parse `OC_COOKIE_SECURE` with `strconv.ParseBool`, default it to `true`, parse `OC_SESSION_TTL`, and default the TTL to `12h`.

Update the existing `TestLoadDefaults` fixture to supply the four required `OC_*` values while continuing to assert the existing DBW defaults. Add a test that rejects setting only one of `OC_BOOTSTRAP_ADMIN_USER` and `OC_BOOTSTRAP_ADMIN_PASSWORD`.

- [ ] **Step 4: Write the unavailable-resource test**

```go
func TestOpenRejectsUnavailablePostgres(t *testing.T) {
  ctx, cancel := context.WithTimeout(context.Background(), 200*time.Millisecond)
  defer cancel()
  _, err := Open(ctx, "postgres://127.0.0.1:1/ops", "redis://127.0.0.1:1/0")
  if err == nil { t.Fatal("expected dependency error") }
}
```

- [ ] **Step 5: Implement resource ownership**

```go
type Resources struct { Postgres *pgxpool.Pool; Redis *redis.Client }

func Open(ctx context.Context, postgresURL, redisURL string) (*Resources, error) {
  pool, err := pgxpool.New(ctx, postgresURL)
  if err != nil { return nil, fmt.Errorf("open postgres: %w", err) }
  if err := pool.Ping(ctx); err != nil { pool.Close(); return nil, fmt.Errorf("ping postgres: %w", err) }
  options, err := redis.ParseURL(redisURL)
  if err != nil { pool.Close(); return nil, fmt.Errorf("parse redis url: %w", err) }
  client := redis.NewClient(options)
  if err := client.Ping(ctx).Err(); err != nil { _ = client.Close(); pool.Close(); return nil, fmt.Errorf("ping redis: %w", err) }
  return &Resources{Postgres:pool,Redis:client}, nil
}

func (r *Resources) Ready(ctx context.Context) bool { return r.Postgres.Ping(ctx) == nil && r.Redis.Ping(ctx).Err() == nil }
func (r *Resources) Close() { _ = r.Redis.Close(); r.Postgres.Close() }
```

- [ ] **Step 6: Promote dependencies and run tests**

```bash
cd api
go get github.com/redis/go-redis/v9@v9.21.0
go mod tidy
go test ./internal/config ./internal/platform -v
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add api/internal/config api/internal/platform api/go.mod api/go.sum
git commit -m "feat: add ops console platform configuration"
```

### Task 3: Create Ordered PostgreSQL Migrations

**Files:**
- Create: `api/internal/migrate/migrate.go`
- Create: `api/internal/migrate/migrate_test.go`
- Create: `api/internal/migrate/sql/0001_identity_registry.sql`

**Interfaces:**
- Consumes: `*pgxpool.Pool` from Task 2.
- Produces: `migrate.Apply(ctx context.Context, pool *pgxpool.Pool) error`.

- [ ] **Step 1: Write the migration parser test**

```go
func TestFilesAreOrderedAndNamed(t *testing.T) {
  files, err := migrationFiles()
  if err != nil { t.Fatal(err) }
  if len(files) != 1 || files[0].Name != "0001_identity_registry.sql" { t.Fatalf("files = %+v", files) }
  if !strings.Contains(files[0].SQL,"CREATE TABLE users") || !strings.Contains(files[0].SQL,"CREATE TABLE connections") { t.Fatal("required tables missing") }
}
```

- [ ] **Step 2: Run the test and confirm red**

Run: `cd api && go test ./internal/migrate -run TestFilesAreOrderedAndNamed -v`

Expected: FAIL because the package does not exist.

- [ ] **Step 3: Add the first migration**

```sql
CREATE TABLE users (id text PRIMARY KEY, username text NOT NULL UNIQUE, display_name text NOT NULL, password_hash text NOT NULL, system_role text NOT NULL CHECK (system_role IN ('member','admin')), disabled_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE teams (id text PRIMARY KEY, name text NOT NULL UNIQUE, created_by text NOT NULL REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE team_members (team_id text NOT NULL REFERENCES teams(id) ON DELETE CASCADE, user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE, role text NOT NULL CHECK (role IN ('member','admin')), created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (team_id,user_id));
CREATE TABLE connections (id text PRIMARY KEY, name text NOT NULL, kind text NOT NULL CHECK (kind IN ('database','ssh')), driver text NOT NULL CHECK (driver IN ('mysql','postgres','mongodb','redis','ssh')), scope text NOT NULL CHECK (scope IN ('personal','team')), owner_user_id text REFERENCES users(id) ON DELETE CASCADE, team_id text REFERENCES teams(id) ON DELETE CASCADE, endpoint jsonb NOT NULL, config jsonb NOT NULL DEFAULT '{}'::jsonb, secret_key_id text NOT NULL, secret_ciphertext bytea NOT NULL, created_by text NOT NULL REFERENCES users(id), updated_by text NOT NULL REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), CHECK ((scope='personal' AND owner_user_id IS NOT NULL AND team_id IS NULL) OR (scope='team' AND owner_user_id IS NULL AND team_id IS NOT NULL)));
CREATE UNIQUE INDEX connections_personal_name ON connections(owner_user_id,lower(name)) WHERE scope='personal';
CREATE UNIQUE INDEX connections_team_name ON connections(team_id,lower(name)) WHERE scope='team';
CREATE TABLE audit_events (id bigserial PRIMARY KEY, actor_user_id text REFERENCES users(id), action text NOT NULL, resource_type text NOT NULL, resource_id text NOT NULL, metadata jsonb NOT NULL DEFAULT '{}'::jsonb, created_at timestamptz NOT NULL DEFAULT now());
```

- [ ] **Step 4: Implement the runner**

Embed `sql/*.sql`, sort by filename, acquire advisory lock `7182215601`, create `schema_migrations(version text primary key, applied_at timestamptz not null default now())`, and apply each unseen file in one transaction. Insert the filename only after its SQL succeeds and release the lock on every return path.

- [ ] **Step 5: Run unit and optional integration tests**

```bash
cd api
go test ./internal/migrate -v
OC_TEST_DATABASE_URL=postgres://ops_test:ops_test@localhost:55432/ops_console_test go test ./internal/migrate -run TestApplyIntegration -v
```

Expected: unit PASS; integration PASS when configured and explicit SKIP when the variable is empty.

- [ ] **Step 6: Commit**

```bash
git add api/internal/migrate
git commit -m "feat: add identity and registry migrations"
```

### Task 4: Implement Users, Teams, and Password Verification

**Files:**
- Create: `api/internal/identity/password.go`
- Create: `api/internal/identity/password_test.go`
- Create: `api/internal/identity/store.go`
- Create: `api/internal/identity/store_test.go`

**Interfaces:**
- Consumes: migrated PostgreSQL pool.
- Produces: `User`, `Team`, `Principal`, `HashPassword`, `VerifyPassword`, `NewStore`, `BootstrapAdmin`, `Authenticate`, `CreateUser`, `CreateTeam`, `AddTeamMember`, and `PrincipalForUser`.

- [ ] **Step 1: Write failing Argon2id tests**

```go
func TestHashAndVerifyPassword(t *testing.T) {
  encoded, err := HashPassword("correct horse battery staple")
  if err != nil { t.Fatal(err) }
  if !strings.HasPrefix(encoded,"$argon2id$v=19$") { t.Fatalf("hash = %q",encoded) }
  if !VerifyPassword("correct horse battery staple",encoded) { t.Fatal("correct password rejected") }
  if VerifyPassword("wrong",encoded) { t.Fatal("wrong password accepted") }
}
```

- [ ] **Step 2: Run the test and confirm red**

Run: `cd api && go test ./internal/identity -run TestHashAndVerifyPassword -v`

Expected: FAIL because password functions do not exist.

- [ ] **Step 3: Implement fixed Argon2id parameters**

Use version `19`, memory `64*1024`, iterations `3`, parallelism `2`, salt length `16`, and key length `32`. Encode PHC format, parse every parameter, and use constant-time comparison in `VerifyPassword`.

- [ ] **Step 4: Define exact store contracts**

```go
type User struct { ID, Username, DisplayName, SystemRole string; Disabled bool }
type Team struct { ID, Name, Role string }
type Principal struct { User User; Teams map[string]string }
type Store struct { pool *pgxpool.Pool }

var ErrAlreadyBootstrapped = errors.New("identity already bootstrapped")
var ErrInvalidCredentials = errors.New("invalid credentials")
var ErrForbidden = errors.New("forbidden")

func NewStore(pool *pgxpool.Pool) *Store
func (s *Store) BootstrapAdmin(ctx context.Context, username, password string) error
func (s *Store) Authenticate(ctx context.Context, username, password string) (User, error)
func (s *Store) CreateUser(ctx context.Context, actor Principal, username, displayName, password, role string) (User, error)
func (s *Store) CreateTeam(ctx context.Context, actor Principal, name string) (Team, error)
func (s *Store) AddTeamMember(ctx context.Context, actor Principal, teamID, userID, role string) error
func (s *Store) PrincipalForUser(ctx context.Context, userID string) (Principal, error)
```

Generate random 18-byte base64url IDs prefixed with `usr_` and `team_`. Bootstrap succeeds only while `users` is empty. Only system admins create users/teams; system admins and the target team's admins add members.

- [ ] **Step 5: Add PostgreSQL integration cases**

Test first/second bootstrap, correct/wrong login, disabled login, member denial, and team-admin scope. Use a test transaction or isolated schema; skip with a clear message only when `OC_TEST_DATABASE_URL` is unset.

- [ ] **Step 6: Run the identity suite**

Run: `cd api && go test ./internal/identity -v`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add api/internal/identity
git commit -m "feat: add local users and team authorization"
```

### Task 5: Add Redis Login Sessions, Cookies, and CSRF

**Files:**
- Create: `api/internal/identity/sessions.go`
- Create: `api/internal/identity/sessions_test.go`
- Create: `api/internal/identity/context.go`
- Create: `api/internal/httpapi/auth_middleware.go`
- Create: `api/internal/httpapi/auth_middleware_test.go`
- Create: `api/internal/httpapi/auth_handlers.go`
- Create: `api/internal/httpapi/auth_handlers_test.go`
- Modify: `api/internal/httpapi/router.go`
- Modify: `api/go.mod`
- Modify: `api/go.sum`

**Interfaces:**
- Consumes: `identity.Store`, `redis.Cmdable`, session TTL, and cookie-security config.
- Produces: `Sessions.Create/Get/Delete/DeleteUser`, authenticated principal context, and `/api/auth/login`, `/api/auth/logout`, `/api/auth/session`.

- [ ] **Step 1: Write the failing session round-trip test**

```go
func TestSessionRoundTripAndExpiry(t *testing.T) {
  server := miniredis.RunT(t)
  client := redis.NewClient(&redis.Options{Addr:server.Addr()})
  sessions := NewSessions(client,12*time.Hour)
  created, err := sessions.Create(context.Background(),"usr_alice")
  if err != nil { t.Fatal(err) }
  loaded, err := sessions.Get(context.Background(),created.ID)
  if err != nil || loaded.UserID != "usr_alice" || loaded.CSRFToken == "" { t.Fatalf("loaded=%+v err=%v",loaded,err) }
  server.FastForward(13*time.Hour)
  if _, err := sessions.Get(context.Background(),created.ID); !errors.Is(err,ErrSessionNotFound) { t.Fatalf("err=%v",err) }
}
```

- [ ] **Step 2: Implement opaque sessions**

```go
type LoginSession struct { ID, UserID, CSRFToken string; ExpiresAt time.Time }
type Sessions struct { redis redis.Cmdable; ttl time.Duration; now func() time.Time }
var ErrSessionNotFound = errors.New("session not found")
```

Generate 32-byte base64url IDs and CSRF tokens, store JSON at `ops:session:<id>` with TTL, and maintain `ops:user-sessions:<userID>` so password, role, and disabled-state changes can revoke all user sessions.

- [ ] **Step 3: Write middleware tests**

Cover public health/login, `401 auth_required` without a cookie, principal injection with a valid cookie, and exact `X-CSRF-Token` enforcement for `POST`, `PUT`, `PATCH`, and `DELETE` while safe methods remain exempt.

- [ ] **Step 4: Implement cookie and auth handlers**

Use cookie `ops_session` with `Path=/`, `HttpOnly=true`, configured `Secure`, `SameSite=Strict`, and `MaxAge` matching TTL. Login accepts exactly `{username,password}`, returns `{user,csrfToken}`, and uses one `invalid_credentials` response for unknown users and wrong passwords. Logout deletes Redis state and expires the cookie. Session returns `{user,teams,csrfToken}`.

- [ ] **Step 5: Install test support and run suites**

```bash
cd api
go get github.com/alicebob/miniredis/v2@v2.35.0
go test ./internal/identity ./internal/httpapi -run 'Session|Auth|CSRF' -v
go test ./internal/identity ./internal/httpapi -v
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add api/internal/identity api/internal/httpapi api/go.mod api/go.sum
git commit -m "feat: add authenticated cookie sessions"
```

### Task 6: Add a Versioned Encrypted PostgreSQL Connection Registry

**Files:**
- Create: `api/internal/registry/model.go`
- Create: `api/internal/registry/keyring.go`
- Create: `api/internal/registry/keyring_test.go`
- Create: `api/internal/registry/postgres_store.go`
- Create: `api/internal/registry/postgres_store_test.go`
- Keep unchanged: `api/internal/registry/store.go`

**Interfaces:**
- Consumes: `identity.Principal`, PostgreSQL pool, `OC_CREDENTIAL_KEYS`, and `OC_ACTIVE_CREDENTIAL_KEY`.
- Produces: unified `Connection`, `Secret`, `Keyring`, and authorization-aware `PGStore`.

- [ ] **Step 1: Write a failing authenticated-encryption test**

```go
func TestKeyringBindsCiphertextToConnectionID(t *testing.T) {
  key := base64.StdEncoding.EncodeToString(bytes.Repeat([]byte{7},32))
  ring, err := ParseKeyring("v1:"+key,"v1")
  if err != nil { t.Fatal(err) }
  sealed, err := ring.Seal("conn_a",Secret{Username:"ops",Password:"secret"})
  if err != nil { t.Fatal(err) }
  opened, err := ring.Open("conn_a",sealed.KeyID,sealed.Ciphertext)
  if err != nil || opened.Password != "secret" { t.Fatalf("opened=%+v err=%v",opened,err) }
  if _, err := ring.Open("conn_b",sealed.KeyID,sealed.Ciphertext); err == nil { t.Fatal("ciphertext replay accepted") }
}
```

- [ ] **Step 2: Define exact registry types**

```go
type Connection struct { ID string `json:"id"`; Name string `json:"name"`; Kind string `json:"kind"`; Driver string `json:"driver"`; Scope string `json:"scope"`; OwnerUserID string `json:"ownerUserId,omitempty"`; TeamID string `json:"teamId,omitempty"`; Endpoint json.RawMessage `json:"endpoint"`; Config json.RawMessage `json:"config"`; HasSecret bool `json:"hasSecret"` }
type Secret struct { Username string `json:"username"`; Password string `json:"password,omitempty"`; PrivateKey string `json:"privateKey,omitempty"`; Passphrase string `json:"passphrase,omitempty"` }
type SaveInput struct { Connection Connection `json:"connection"`; Secret *Secret `json:"secret,omitempty"` }
type SealedSecret struct { KeyID string; Ciphertext []byte }
```

- [ ] **Step 3: Implement the keyring**

Parse comma-separated `keyID:base64` entries, require 32 decoded bytes per key, require the active key, serialize secrets as JSON, and use AES-256-GCM with connection ID as additional authenticated data. Store `nonce || ciphertext` in `secret_ciphertext`.

- [ ] **Step 4: Write authorization-aware store tests**

Cover owner-only personal mutation, team-admin mutation, team-member secret use, non-member denial, list filtering, audit insertion, and JSON serialization that omits ciphertext and all secret values.

- [ ] **Step 5: Implement exact store methods**

```go
type PGStore struct { pool *pgxpool.Pool; keys *Keyring }
func NewPGStore(pool *pgxpool.Pool,keys *Keyring) *PGStore
func (s *PGStore) List(ctx context.Context,p identity.Principal,kind,scope string) ([]Connection,error)
func (s *PGStore) Create(ctx context.Context,p identity.Principal,input SaveInput) (Connection,error)
func (s *PGStore) Update(ctx context.Context,p identity.Principal,id string,input SaveInput) (Connection,error)
func (s *PGStore) Delete(ctx context.Context,p identity.Principal,id string) error
func (s *PGStore) SecretForUse(ctx context.Context,p identity.Principal,id string) (Connection,Secret,error)
```

Define `ErrNotFound` and `ErrForbidden` sentinels for handler mapping. Create requires a non-empty secret object. Update with `Secret == nil` preserves the stored key ID and ciphertext. Create, update, delete, and secret-use insert an `audit_events` row in the same transaction. Audit metadata contains kind, driver, scope, and outcome only.

- [ ] **Step 6: Run all registry tests**

Run: `cd api && go test ./internal/registry -v`

Expected: keyring and legacy SQLite tests PASS; PG tests PASS when configured and SKIP otherwise.

- [ ] **Step 7: Commit**

```bash
git add api/internal/registry
git commit -m "feat: add encrypted unified connection registry"
```

### Task 7: Expose Authenticated Registry, User, and Team APIs

**Files:**
- Create: `api/internal/httpapi/connection_handlers.go`
- Create: `api/internal/httpapi/connection_handlers_test.go`
- Extend: `api/internal/httpapi/auth_handlers.go`
- Extend: `api/internal/httpapi/auth_handlers_test.go`
- Modify: `api/internal/httpapi/router.go`
- Modify: `api/cmd/server/main.go`

**Interfaces:**
- Consumes: identity store/sessions, `registry.PGStore`, platform resources, and auth middleware.
- Produces: `/api/registry/v2/connections`, `/api/users`, `/api/teams`, and `/api/teams/{id}/members`.

- [ ] **Step 1: Write failing handler tests**

Use this fakeable boundary:

```go
type ConnectionRegistry interface {
  List(context.Context,identity.Principal,string,string) ([]registry.Connection,error)
  Create(context.Context,identity.Principal,registry.SaveInput) (registry.Connection,error)
  Update(context.Context,identity.Principal,string,registry.SaveInput) (registry.Connection,error)
  Delete(context.Context,identity.Principal,string) error
}
```

Test authenticated filtering, personal ownership, team denial, unknown JSON fields, secret omission, and `requestId` in errors.

- [ ] **Step 2: Stabilize the error envelope**

```go
func writeError(w http.ResponseWriter,status int,code,message string) {
  writeJSON(w,status,map[string]any{"error":map[string]any{"code":code,"message":message,"requestId":w.Header().Get("X-Request-ID")}})
}
```

Preserve existing legacy error codes.

- [ ] **Step 3: Register exact connection routes**

```text
GET    /api/registry/v2/connections?kind=database|ssh&scope=personal|team
POST   /api/registry/v2/connections
PUT    /api/registry/v2/connections/{id}
DELETE /api/registry/v2/connections/{id}
```

Validate kind/driver pairs, names, `{host,port}` endpoints, team scope, and the 1 MiB request cap. Return `201`, `200`, and `204` consistently.

- [ ] **Step 4: Register user/team routes**

Implement system-admin user/team creation, principal-filtered lists, and team-admin membership mutation. Never serialize password hashes.

- [ ] **Step 5: Wire startup in dependency order**

Load config, open resources, apply migrations, bootstrap only when both bootstrap fields exist, parse keyring, create identity store/sessions/PG registry, retain the database runtime `session.Store`, and use a two-second readiness timeout.

- [ ] **Step 6: Run all Go verification**

```bash
cd api
go test ./...
go test -race ./internal/identity ./internal/registry ./internal/httpapi
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add api/cmd/server api/internal/httpapi
git commit -m "feat: expose authenticated registry APIs"
```

### Task 8: Build the Authenticated React Shell

**Files:**
- Modify: `web/package.json`
- Modify: `web/package-lock.json`
- Modify: `web/src/main.tsx`
- Create: `web/src/app/AppRouter.tsx`
- Create: `web/src/app/AppRouter.test.tsx`
- Create: `web/src/auth/types.ts`
- Create: `web/src/auth/client.ts`
- Create: `web/src/auth/AuthProvider.tsx`
- Create: `web/src/auth/AuthProvider.test.tsx`
- Create: `web/src/auth/LoginPage.tsx`
- Create: `web/src/auth/LoginPage.test.tsx`
- Create: `web/src/layout/AppShell.tsx`
- Create: `web/src/layout/AppShell.css`
- Create: `web/src/pages/ConnectionsPage.tsx`
- Create: `web/src/pages/DatabasePage.tsx`
- Create: `web/src/pages/LogsPendingPage.tsx`
- Create: `web/src/pages/SettingsPage.tsx`
- Modify: `web/src/api/client.ts`
- Modify: `web/src/api/client.test.ts`
- Modify: `web/src/app/tokens.css`

**Interfaces:**
- Consumes: Task 7 auth/session APIs.
- Produces: `AuthProvider`, `useAuth`, `authFetch`, and routes `/login`, `/connections`, `/database`, `/logs`, `/settings`.

- [ ] **Step 1: Write the failing route test**

```tsx
function fakeSession(): AuthSession {
  return {user:{id:'usr_1',username:'alice',displayName:'Alice',systemRole:'member'},teams:[],csrfToken:'csrf-test'}
}

function renderRouter(value:{session:AuthSession|null},entries:string[]) {
  return render(<MemoryRouter initialEntries={entries}><AuthProvider initialSession={value.session}><AppRouter /></AuthProvider></MemoryRouter>)
}

it('redirects guests to login and authenticated users to connections',async () => {
  const guest = renderRouter({session:null},['/database'])
  expect(await guest.findByRole('heading',{name:'登录 Ops Console'})).toBeVisible()
  guest.unmount()
  const user = renderRouter({session:fakeSession()},['/'])
  expect(await user.findByRole('heading',{name:'连接中心'})).toBeVisible()
})
```

- [ ] **Step 2: Install routing and confirm red**

```bash
cd web
npm install react-router-dom@^7.0.0
npm test -- --run src/app/AppRouter.test.tsx
```

Expected: FAIL because router/auth components do not exist.

- [ ] **Step 3: Implement CSRF-aware auth fetch**

```ts
let csrfToken = ''
export function setCSRFToken(value:string) { csrfToken = value }
export function getCSRFToken() { return csrfToken }
export async function authFetch(input:RequestInfo|URL,init:RequestInit={}) {
  const method = (init.method ?? 'GET').toUpperCase()
  const headers = new Headers(init.headers)
  headers.set('Accept','application/json')
  if (!['GET','HEAD','OPTIONS'].includes(method) && csrfToken) headers.set('X-CSRF-Token',csrfToken)
  const response = await fetch(input,{...init,headers,credentials:'same-origin'})
  if (!response.ok) {
    const payload = await response.json().catch(() => ({})) as {error?:{code?:string;message?:string;details?:unknown}}
    throw Object.assign(new Error(payload.error?.message ?? `请求失败 (${response.status})`),{status:response.status,code:payload.error?.code ?? 'request_failed',details:payload.error?.details})
  }
  return response
}

export async function json<T>(input:RequestInfo|URL,init:RequestInit={}) {
  const response = await authFetch(input,init)
  if (response.status === 204) return undefined as T
  return await response.json() as T
}
```

Define `AuthSession` as `{user:{id,username,displayName,systemRole},teams:{id,name,role}[],csrfToken}` and keep JSON names aligned with Go.

- [ ] **Step 4: Implement AuthProvider and LoginPage**

On mount call `GET /api/auth/session`; `401` means guest and other failures expose a retry action. Login posts credentials, sets CSRF, and navigates to `/connections`. Logout posts, clears state, and navigates to `/login`. Store neither password nor session ID in Web Storage.

- [ ] **Step 5: Implement the approved light AppShell**

Use navigation labels `连接中心`, `数据库`, `日志`, and `设置`. Show current display name and logout. Set default tokens to `--bg:#eef3f9`, `--surface:#fff`, `--accent:#0ea5e9`, `--ink:#152238`, and `--line:#d8e2ef`, retaining terminal dark tokens.

- [ ] **Step 6: Preserve the current database app**

`DatabasePage` creates the existing `APIClient`, calls `createSession` only after authentication, and renders `<App>`. Keep the current database connection UI/profile compatibility until the next plan. Make `APIClient` add `X-CSRF-Token: getCSRFToken()` to every unsafe request, including `POST /api/sessions`, and add a test that observes the header after `setCSRFToken('csrf-test')`.

Create compile-safe route pages in this task: `ConnectionsPage` renders the real heading and empty/loading boundary that Task 10 fills; `SettingsPage` renders the current account summary that Task 9 extends; `LogsPendingPage` truthfully states that log migration belongs to a later approved milestone and offers no non-working action.

- [ ] **Step 7: Run frontend tests**

```bash
cd web
npm test -- --run src/auth src/app/AppRouter.test.tsx
npm run typecheck
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add web/package.json web/package-lock.json web/src
git commit -m "feat: add authenticated ops console shell"
```

### Task 9: Add User and Team Administration UI

**Files:**
- Create: `web/src/settings/client.ts`
- Modify: `web/src/pages/SettingsPage.tsx`
- Create: `web/src/pages/SettingsPage.test.tsx`
- Modify: `web/src/app/AppRouter.tsx`

**Interfaces:**
- Consumes: `/api/users`, `/api/teams`, and `/api/teams/{id}/members`.
- Produces: permission-aware user/team forms.

Define `UserSummary` as `{id,username,displayName,systemRole,disabled}`, `TeamSummary` as `{id,name,role}`, `CreateUserInput` as `{username,displayName,password,systemRole}`, and `AddMemberInput` as `{userId,role}`.

- [ ] **Step 1: Write failing permission tests**

Test that members see profile/memberships only; system admins see `创建用户` and `创建团队`; team admins see `添加成员` only for administered teams; successful passwords disappear and never render back.

- [ ] **Step 2: Run the test and confirm red**

Run: `cd web && npm test -- --run src/pages/SettingsPage.test.tsx`

Expected: FAIL because the page does not exist.

- [ ] **Step 3: Implement exact client methods**

```ts
export const settingsClient = {
  listUsers: () => json<UserSummary[]>('/api/users'),
  createUser: (input:CreateUserInput) => json<UserSummary>('/api/users',{method:'POST',body:JSON.stringify(input)}),
  listTeams: () => json<TeamSummary[]>('/api/teams'),
  createTeam: (name:string) => json<TeamSummary>('/api/teams',{method:'POST',body:JSON.stringify({name})}),
  addMember: (teamId:string,input:AddMemberInput) => json<void>(`/api/teams/${encodeURIComponent(teamId)}/members`,{method:'POST',body:JSON.stringify(input)}),
}
```

All calls use `authFetch`; `json<void>` accepts `204 No Content`.

- [ ] **Step 4: Implement accessible forms**

Use real labels, `autocomplete="new-password"`, inline API errors, pending submit state, and `role="status"` success announcements. Use existing custom selects rather than native `<select>`.

- [ ] **Step 5: Run focused and invariant tests**

```bash
cd web
npm test -- --run src/pages/SettingsPage.test.tsx src/app/entrypoints.test.ts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add web/src/settings web/src/pages/SettingsPage.tsx web/src/pages/SettingsPage.test.tsx web/src/app/AppRouter.tsx
git commit -m "feat: add ops console user and team settings"
```

### Task 10: Build the Unified Database and SSH Connection Center

**Files:**
- Create: `web/src/connections/types.ts`
- Create: `web/src/connections/client.ts`
- Create: `web/src/connections/connectionForm.ts`
- Create: `web/src/connections/connectionForm.test.ts`
- Modify: `web/src/pages/ConnectionsPage.tsx`
- Create: `web/src/pages/ConnectionsPage.css`
- Create: `web/src/pages/ConnectionsPage.test.tsx`
- Modify: `web/src/app/AppRouter.tsx`

**Interfaces:**
- Consumes: `/api/registry/v2/connections` and authenticated teams.
- Produces: list/filter/create/edit/delete flows for database and SSH records without exposing stored secrets.

Define `ConnectionFormValue` with `name`, `kind`, `driver`, `scope`, `teamId`, `host`, `port`, `database`, `username`, `password`, `privateKey`, and `passphrase` strings. Export `toSaveInput(value: ConnectionFormValue, teams: TeamSummary[]): SaveInput`; it throws `ConnectionFormError` containing a field-error map when validation fails.

- [ ] **Step 1: Write failing form-normalization tests**

```ts
it('builds a personal postgres record without a blank secret',() => {
  expect(toSaveInput({name:'Analytics',kind:'database',driver:'postgres',scope:'personal',host:'db.internal',port:'5432',database:'app',username:'ops',password:''},[])).toEqual({
    connection:{name:'Analytics',kind:'database',driver:'postgres',scope:'personal',endpoint:{host:'db.internal',port:5432},config:{database:'app'}},
  })
})
```

Add SSH default port `22`, required team, invalid port, driver/kind mismatch, and non-empty secret cases.

- [ ] **Step 2: Run the test and confirm red**

Run: `cd web && npm test -- --run src/connections/connectionForm.test.ts`

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement contracts and client**

Mirror Go `Connection`, `Secret`, and `SaveInput` JSON exactly. Implement `list({kind,scope})`, `create`, `update`, and `remove` with `authFetch`. The `Connection` type must have no secret or ciphertext fields.

- [ ] **Step 4: Write failing page tests**

Test all/database/SSH tabs, mine/team filters, empty state, driver-specific form fields, redacted edit behavior, delete confirmation, authorization messages, and successful refresh.

- [ ] **Step 5: Implement the connection center**

Render summary cards, searchable table, filters, driver badges, and actions. Blank secret fields preserve the existing secret. This milestone manages records only; using saved records in database/log workspaces is explicitly reserved for later plans.

- [ ] **Step 6: Run page, type, and invariant checks**

```bash
cd web
npm test -- --run src/connections src/pages/ConnectionsPage.test.tsx src/app/entrypoints.test.ts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add web/src/connections web/src/pages/ConnectionsPage.tsx web/src/pages/ConnectionsPage.css web/src/pages/ConnectionsPage.test.tsx web/src/app/AppRouter.tsx
git commit -m "feat: add unified connection center"
```

### Task 11: Embed the SPA and Produce One Application Container

**Files:**
- Create: `api/internal/webui/handler.go`
- Create: `api/internal/webui/handler_test.go`
- Create: `api/internal/webui/dist/.gitkeep`
- Modify: `api/internal/httpapi/router.go`
- Create: `Dockerfile`
- Modify: `deploy/compose.yml`
- Modify: `deploy/.env.example`
- Modify: `Makefile`
- Modify: `.gitignore`

**Interfaces:**
- Consumes: Vite `web/dist` and the Go router.
- Produces: `webui.Handler(files fs.FS) http.Handler`, `webui.Embedded() http.Handler`, one `ops-console` binary, and one `app` Compose service on port `8080`.

- [ ] **Step 1: Write the failing SPA fallback test**

```go
func TestHandlerServesAssetsAndFallsBackToIndex(t *testing.T) {
  files := fstest.MapFS{"index.html":{Data:[]byte("<main>Ops Console</main>")},"assets/app.js":{Data:[]byte("console.log('ops')")}}
  handler := Handler(files)
  for _, path := range []string{"/","/connections","/database/workspace/c1"} {
    rr := httptest.NewRecorder()
    handler.ServeHTTP(rr,httptest.NewRequest(http.MethodGet,path,nil))
    if rr.Code != http.StatusOK || !strings.Contains(rr.Body.String(),"Ops Console") { t.Fatalf("path %s: %d %q",path,rr.Code,rr.Body.String()) }
  }
  rr := httptest.NewRecorder()
  handler.ServeHTTP(rr,httptest.NewRequest(http.MethodGet,"/assets/app.js",nil))
  if rr.Code != http.StatusOK || !strings.Contains(rr.Body.String(),"console.log") { t.Fatalf("asset: %d %q",rr.Code,rr.Body.String()) }
}
```

- [ ] **Step 2: Implement embedded assets**

Use `//go:embed all:dist`, `fs.Sub`, one-year immutable cache for `/assets/`, `no-cache` for `index.html`, and index fallback only for `GET`/`HEAD`. API routes retain ServeMux precedence.

Because the repository already ignores every `dist/` directory, add these exact exceptions so only the empty embed marker is tracked while generated assets remain ignored:

```gitignore
!/api/internal/webui/dist/
/api/internal/webui/dist/*
!/api/internal/webui/dist/.gitkeep
```

- [ ] **Step 3: Add the three-stage Dockerfile**

The Node stage runs `npm ci` and `npm run build` in `/src/web`. The Go stage copies `web/dist` into `api/internal/webui/dist` and builds `/out/ops-console`. The Alpine runtime contains CA certificates, a non-root user, and `/ops-console`, but no Node runtime.

- [ ] **Step 4: Replace active Compose topology**

Define exactly `postgres:16-alpine`, `redis:7-alpine`, and root-built `app`. Expose `8080:8080`; set all required `OC_*` and existing DBW allowlist/query variables; preserve PostgreSQL and Redis volumes. Remove active `web` and `proxy` services. In `.env.example`, leave credential key and bootstrap password empty and label them required; never provide a production-usable default.

- [ ] **Step 5: Update build targets**

Add `web-assets`, `test-foundation`, and `build-container`. `web-assets` builds Vite and copies output to the embed directory before Go build. `test-foundation` runs Go, Vitest, TypeScript, and production builds.

- [ ] **Step 6: Verify artifact and services**

```bash
make test-foundation
export OC_CREDENTIAL_KEYS="v1:$(openssl rand -base64 32)"
export OC_ACTIVE_CREDENTIAL_KEY=v1
export OC_BOOTSTRAP_ADMIN_USER=admin
export OC_BOOTSTRAP_ADMIN_PASSWORD='foundation-smoke-password'
export OC_COOKIE_SECURE=false
docker compose --env-file deploy/.env.example -f deploy/compose.yml config --services
docker build -t ops-console:foundation .
docker run --rm ops-console:foundation sh -c 'test ! -x /usr/local/bin/node && test -x /ops-console'
```

Expected service lines: `postgres`, `redis`, `app`; image check exits `0`.

- [ ] **Step 7: Commit**

```bash
git add .gitignore Dockerfile Makefile api/internal/webui api/internal/httpapi/router.go deploy/compose.yml deploy/.env.example
git commit -m "build: run ops console as one application container"
```

### Task 12: Verify and Document the Foundation Boundary

**Files:**
- Modify: `README.md`
- Create: `docs/migration/foundation-runbook.md`
- Create: `scripts/smoke-foundation.mjs`

**Interfaces:**
- Consumes: Compose stack and foundation APIs.
- Produces: repeatable smoke verification and explicit handoff to the database-runtime migration plan.

- [ ] **Step 1: Write the smoke script before starting services**

Use Node's built-in `fetch`; retain `ops_session` and `csrfToken`; verify readiness, admin login, current session, team creation, personal PostgreSQL record, team SSH record, secret-field omission, logout, and rejected reuse of the logged-out cookie.

- [ ] **Step 2: Confirm the smoke script initially fails**

Run: `node scripts/smoke-foundation.mjs http://localhost:8080`

Expected: connection failure while the stack is stopped.

- [ ] **Step 3: Write exact operations and recovery runbook**

Document generating a 32-byte base64 key, setting a non-default admin password, starting Compose, reading health, removing bootstrap variables after first login, backing up PostgreSQL, locating migration snapshots, stopping without volume deletion, and the saved-connection runtime boundary.

- [ ] **Step 4: Update README without overstating scope**

Document Ops Console naming, foundation features, `make test-foundation`, single application runtime, PostgreSQL/Redis, login, encrypted connections, and compatibility behavior. State that Log Lens business features are not migrated yet.

- [ ] **Step 5: Run the full gate**

```bash
make test-foundation
export OC_CREDENTIAL_KEYS="v1:$(openssl rand -base64 32)"
export OC_ACTIVE_CREDENTIAL_KEY=v1
export OC_BOOTSTRAP_ADMIN_USER=admin
export OC_BOOTSTRAP_ADMIN_PASSWORD='foundation-smoke-password'
export OC_COOKIE_SECURE=false
docker compose --env-file deploy/.env.example -f deploy/compose.yml up -d --build
node scripts/smoke-foundation.mjs http://localhost:8080
docker compose --env-file deploy/.env.example -f deploy/compose.yml ps
docker compose --env-file deploy/.env.example -f deploy/compose.yml down
git status --short
```

Expected: tests and smoke PASS; `app`, `postgres`, and `redis` are healthy before shutdown; volumes remain; only intended files are modified.

- [ ] **Step 6: Commit**

```bash
git add README.md docs/migration/foundation-runbook.md scripts/smoke-foundation.mjs
git commit -m "docs: verify ops console foundation milestone"
```

---

## Foundation Completion Gate

- A current snapshot exists for both repositories, including the dirty `log-lens` worktree.
- Authentication protects application routes and APIs.
- System-admin and team-admin store/handler tests pass.
- Personal/team database and SSH records are encrypted in PostgreSQL and never serialize secrets.
- The light AppShell, settings, and connection center pass Vitest and TypeScript.
- Existing Database Workbench Go and React suites remain green.
- One image contains React assets and one Go binary but no Node runtime.
- Compose has exactly `app`, `postgres`, and `redis`, with one application port.
- README and runbook state that database-runtime connection adaptation belongs to the next plan.

## Subsequent Plans

1. `ops-console-database-runtime` — resolve unified connection IDs into the existing database runtime, migrate browser/SQLite records, and remove nickname registry behavior.
2. `ops-console-log-core` — port sessions, upload, parser, PostgreSQL indexing, search, filters, context, timeline, and progress jobs.
3. `ops-console-ssh-log-sources` — port SSH directory browsing, remote import, incremental sync, and real-time Tail.
4. `ops-console-cutover` — migrate production data, run parity/performance/security gates, remove compatibility artifacts, and rename the repository.
