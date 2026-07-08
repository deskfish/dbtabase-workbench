# Ops Console Deployment

## Requirements

- Docker Engine and Docker Compose v2
- TCP `8080` reachable from the intended network, or a trusted reverse proxy in front of it
- A 32-byte base64 credential-encryption key

## First deploy

```bash
export OC_CREDENTIAL_KEYS="v1:$(openssl rand -base64 32)"
export OC_ACTIVE_CREDENTIAL_KEY=v1
export OC_BOOTSTRAP_ADMIN_USER=admin
export OC_BOOTSTRAP_ADMIN_PASSWORD='replace-with-a-strong-one-time-password'
export OC_COOKIE_SECURE=false

docker compose --env-file deploy/.env.example -f deploy/compose.yml up -d --build
docker compose --env-file deploy/.env.example -f deploy/compose.yml ps
curl -fsS http://127.0.0.1:8080/health/ready
```

Then verify:

```bash
OC_SMOKE_USER=admin \
OC_SMOKE_PASSWORD='replace-with-a-strong-one-time-password' \
node scripts/smoke-foundation.mjs http://127.0.0.1:8080
```

After first successful login, remove `OC_BOOTSTRAP_ADMIN_USER` and `OC_BOOTSTRAP_ADMIN_PASSWORD` from the runtime environment and restart `app`.

## Updating

```bash
git pull --ff-only
docker compose --env-file deploy/.env.example -f deploy/compose.yml build
docker compose --env-file deploy/.env.example -f deploy/compose.yml up -d
node scripts/smoke-foundation.mjs http://127.0.0.1:8080
```

## Health and logs

- Live: `GET /health/live`
- Ready: `GET /health/ready`
- Logs: `docker compose --env-file deploy/.env.example -f deploy/compose.yml logs --since=10m app`

Compose now owns exactly three services: `app`, `postgres`, and `redis`.
