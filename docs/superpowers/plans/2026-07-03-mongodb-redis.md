# MongoDB & Redis Implementation Plan

> **Status:** Implemented in initial pass (P0+P1 full features)

**Goal:** Extend Database Workbench with MongoDB document/aggregate/index workflows and Redis key/command workflows while preserving the SQL shell.

**Architecture:** `db.Handle` connection abstraction in session store; driver-specific HTTP routes; frontend workspace tabs by `capabilities`.

**Tech Stack:** Go 1.25, mongo-driver, go-redis/v9, React 19, TypeScript, Vitest.

## Delivered

### Backend
- [x] `Handle` with SQL/Mongo/Redis clients
- [x] Ports 27017/6379 in config
- [x] Mongo: metadata, find, aggregate, document CRUD, collection detail, index create/drop
- [x] Redis: SCAN keys, key get/save/delete/TTL, command console with blocklist
- [x] `GET /capabilities`

### Frontend
- [x] ConnectionDialog: MongoDB/Redis options
- [x] Mongo: DocumentView, QueryView, CollectionSchema
- [x] Redis: KeyTree, KeyView, ConsoleView
- [x] App.tsx driver routing

## Follow-ups (optional)
- [ ] Docker Compose services for integration tests
- [ ] Mongo explain tab
- [ ] Redis TLS configuration
- [ ] E2E Playwright for mongo/redis flows
