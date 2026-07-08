# Ops Console Foundation Runbook

This milestone runs one Go application container that serves the React UI and APIs, backed by PostgreSQL and Redis.

## First startup

Generate a credential key:

```bash
openssl rand -base64 32
```

Set it as:

```bash
export OC_CREDENTIAL_KEYS="v1:<base64-key>"
export OC_ACTIVE_CREDENTIAL_KEY=v1
export OC_BOOTSTRAP_ADMIN_USER=admin
export OC_BOOTSTRAP_ADMIN_PASSWORD='replace-with-a-strong-one-time-password'
export OC_COOKIE_SECURE=false
```

Start the stack:

```bash
docker compose --env-file deploy/.env.example -f deploy/compose.yml up -d --build
docker compose --env-file deploy/.env.example -f deploy/compose.yml ps
curl -fsS http://localhost:8080/health/ready
```

After the first successful login, remove `OC_BOOTSTRAP_ADMIN_USER` and `OC_BOOTSTRAP_ADMIN_PASSWORD` from the runtime environment and restart the `app` service. Existing users remain in PostgreSQL.

## Smoke verification

```bash
OC_SMOKE_USER=admin \
OC_SMOKE_PASSWORD='replace-with-a-strong-one-time-password' \
node scripts/smoke-foundation.mjs http://localhost:8080
```

The script verifies readiness, login, session lookup, team creation, encrypted personal PostgreSQL and team SSH records, secret omission from API responses, logout, and rejected reuse of the logged-out cookie.

## Backup and recovery

Back up PostgreSQL before upgrades:

```bash
docker compose --env-file deploy/.env.example -f deploy/compose.yml exec -T postgres \
  pg_dump -U ops -d ops_console > ops-console-$(date +%Y%m%d-%H%M%S).sql
```

Redis stores login sessions only. Losing Redis logs users out but does not delete registry data.

Stop without deleting volumes:

```bash
docker compose --env-file deploy/.env.example -f deploy/compose.yml down
```

Do not run `docker compose down -v` unless you intentionally want to delete PostgreSQL, Redis, and legacy app data volumes.

## Migration snapshots

Non-destructive source snapshots live under `.migration-snapshots/` when captured by `scripts/capture-migration-baseline.sh`. They are intentionally ignored by git.

## Boundary for the next plan

This foundation manages encrypted database and SSH records in PostgreSQL. The existing Database Workbench page still opens runtime connections from its legacy form and compatibility registry. Using unified registry IDs directly in the database workspace is reserved for the `ops-console-database-runtime` plan.

Log Lens business features, uploaded files, and existing PostgreSQL data are not migrated in this milestone.
