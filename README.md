# Ops Console

Ops Console is the foundation merge of the existing Database Workbench with a shared authenticated control plane. It now runs as one Go application that serves the React UI and APIs, with PostgreSQL for identity/encrypted connection records and Redis for login sessions.

## Foundation scope

- Local account login with HTTP-only cookies and CSRF protection.
- Routed React shell: `连接中心`, `数据库`, `日志`, `设置`.
- Encrypted personal/team connection registry for database and SSH records.
- User, team, and team-member administration UI.
- Existing Database Workbench preserved under `/database`.
- Log Lens business features are not migrated yet; `/logs` is a truthful placeholder.

The current database workspace still uses the legacy runtime connection form. Opening database workspaces directly from unified registry records is intentionally left for the next migration plan.

## Runtime

Compose starts exactly three services:

- `app`: one Go process serving React assets and APIs on port `8080`
- `postgres`: identity, teams, encrypted registry, audit data
- `redis`: authenticated login sessions

Node is used only during the Docker build stage.

## Quick start with Docker Compose

```bash
export OC_CREDENTIAL_KEYS="v1:$(openssl rand -base64 32)"
export OC_ACTIVE_CREDENTIAL_KEY=v1
export OC_BOOTSTRAP_ADMIN_USER=admin
export OC_BOOTSTRAP_ADMIN_PASSWORD='change-this-before-use'
export OC_COOKIE_SECURE=false

docker compose --env-file deploy/.env.example -f deploy/compose.yml up -d --build
curl -fsS http://localhost:8080/health/ready
node scripts/smoke-foundation.mjs http://localhost:8080
```

After first login, remove the bootstrap admin environment variables and restart `app`.

## Development checks

```bash
make test-foundation   # Go tests, Vitest, typecheck, Vite build
make build             # builds web assets into Go embed dir, then compiles Go
make build-container   # docker build -t ops-console:foundation .
```

For local split development, provide `OC_DATABASE_URL`, `OC_REDIS_URL`, `OC_CREDENTIAL_KEYS`, and `OC_ACTIVE_CREDENTIAL_KEY` before running `cd api && go run ./cmd/server`; then run `cd web && npm run dev`.

## Documentation

- [Foundation runbook](docs/migration/foundation-runbook.md)
- [Security model](docs/security.md)

## License

Internal project.
