# Ops Console Security Model

## Trust boundaries

Ops Console has local account login backed by PostgreSQL users and Redis login sessions. Browser sessions use HTTP-only cookies and CSRF tokens. Authorization for users, teams, and registry records is enforced in Go; hidden UI controls are not treated as a security boundary.

## Credential storage

Unified database and SSH connection secrets are encrypted server-side with AES-256-GCM through versioned credential keys. List and create/update responses expose `hasSecret` only; they must not return passwords, private keys, passphrases, or ciphertext.

The existing Database Workbench page still supports browser-local encrypted connection profiles for compatibility until the runtime migration plan replaces that source.

## Database runtime

Database permissions remain the final data boundary. Day-to-day querying should use least-privilege database accounts. The web UI warns before risky SQL, but those warnings are not a sandbox.

## Network target control

The API rejects loopback, link-local, multicast, and unspecified destinations to reduce SSRF/scanning risk. Deployments can further restrict targets with `DBW_ALLOWED_CIDRS`, `DBW_ALLOWED_PORTS`, and `DBW_ALLOWED_SUFFIXES`.

## Operations

- Keep `OC_CREDENTIAL_KEYS` secret and backed up. Losing it makes stored registry secrets unrecoverable.
- Remove bootstrap admin environment variables after the first successful login.
- Set `OC_COOKIE_SECURE=true` when serving over HTTPS.
- Back up PostgreSQL before upgrades.
- Redis loss only logs users out; PostgreSQL holds durable identity and registry data.

## Incident response

For suspected credential leakage: revoke affected database/SSH credentials, rotate `OC_CREDENTIAL_KEYS` by adding a new active key for future writes, preserve app/PostgreSQL audit evidence, review dependencies and deployed assets, then re-enable access after smoke verification.
