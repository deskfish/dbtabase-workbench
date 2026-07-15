# SSH Password Authentication Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add password-based SSH connection saving alongside private-key authentication and keep validation/API failures visible inside the connection dialog.

**Architecture:** Extend the existing `ConnectionFormValue` conversion boundary so it produces an encrypted registry secret for password, private-key, or mixed SSH authentication. Keep server persistence unchanged because `registry.Secret` and the SSH client already support both methods. Add dialog-local error state and focused UI grouping in `ConnectionsPage`.

**Tech Stack:** React 19, TypeScript, Vitest, Testing Library, Go registry API, CSS.

## Global Constraints

- SSH login password and private key are alternative valid credentials; at least one is required for a new connection.
- A private-key passphrase is submitted only with a private key.
- Editing a connection with an existing secret may leave all credential fields empty to preserve the stored secret.
- Credentials remain in the existing server-side encrypted store; no database migration.
- API failures remain visible inside the open dialog with `role="alert"`.
- Preserve the existing terminal visual language and do not modify database authentication behavior.

---

### Task 1: SSH Credential Payload and Validation

**Files:**
- Modify: `web/src/connections/connectionForm.ts`
- Test: `web/src/connections/connectionForm.test.ts`

**Interfaces:**
- Consumes: `ConnectionFormValue`, `TeamSummary[]`.
- Produces: `toSaveInput(value, teams, options?)`, where `options.existingSecret` allows edit-time secret preservation.

- [ ] **Step 1: Write failing form conversion tests**

Add tests asserting that an SSH login password produces `{username, password}`, mixed credentials preserve all fields, a new SSH connection without password/private key throws `ConnectionFormError`, a lone passphrase throws, and `{existingSecret: true}` permits empty edit credentials.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npm test -- --run src/connections/connectionForm.test.ts`

Expected: FAIL because SSH password is omitted and missing SSH credentials are currently accepted by the form converter.

- [ ] **Step 3: Implement the minimal converter behavior**

Build the SSH secret from trimmed `username`, `password`, `privateKey`, and conditional `passphrase`. Add `credentials` and `passphrase` field errors for invalid new inputs; omit `secret` only when `options.existingSecret` is true and every credential field is empty.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run: `npm test -- --run src/connections/connectionForm.test.ts`

Expected: all connection form tests pass.

### Task 2: Dialog UI and Visible Errors

**Files:**
- Modify: `web/src/pages/ConnectionsPage.tsx`
- Modify: `web/src/pages/ConnectionsPage.css`
- Test: `web/src/pages/ConnectionsPage.test.tsx`

**Interfaces:**
- Consumes: Task 1 `toSaveInput` behavior and `ConnectionFormError.fields`.
- Produces: SSH authentication group with `登录密码`, `私钥`, `私钥口令`, inline credential errors, and dialog-local API feedback.

- [ ] **Step 1: Write failing page tests**

Add tests that create an SSH connection with password authentication and assert the client payload. Add a rejected-create test and assert the dialog stays open with an alert containing the server message.

- [ ] **Step 2: Run the focused page test and verify RED**

Run: `npm test -- --run src/pages/ConnectionsPage.test.tsx`

Expected: FAIL because the SSH login password field and dialog-local alert do not exist.

- [ ] **Step 3: Implement the minimal UI**

Render database password only in the database branch. In the SSH branch render a styled authentication fieldset containing username, login password, private key, and private-key passphrase. Pass `editing?.hasSecret` into Task 1 validation. Render `error` inside `FormDialog`, and suppress the background page feedback while the dialog is open.

- [ ] **Step 4: Run the focused page test and verify GREEN**

Run: `npm test -- --run src/pages/ConnectionsPage.test.tsx`

Expected: all connection page tests pass with no React warnings.

### Task 3: Regression Verification and Release

**Files:**
- Verify: `web/src/**`
- Deploy: `deploy/compose.yml`

**Interfaces:**
- Consumes: completed frontend behavior from Tasks 1–2.
- Produces: tested commit on `main` and a healthy production app at `http://10.10.80.71/`.

- [ ] **Step 1: Run all frontend tests**

Run: `npm test -- --run`

Expected: zero failed test files and zero failed tests.

- [ ] **Step 2: Build the production frontend**

Run: `npm run build`

Expected: Vite exits 0 and writes `dist/`.

- [ ] **Step 3: Review the diff and commit implementation**

Run: `git diff --check` and inspect `git diff -- web/src`.

Commit only the SSH authentication implementation and its tests; preserve existing user-owned `go.work.sum`, `.gstack/`, and `ui-audit/` changes.

- [ ] **Step 4: Push and deploy the exact main commit**

Push `main`, clone the exact commit into a new `/opt/ops-console-release-<sha>` release directory, copy the existing deploy `.env`, build the app image, and replace only the `app` service with `docker compose ... up -d --no-deps app`.

- [ ] **Step 5: Verify production health**

Run container health inspection, `curl -fsS http://127.0.0.1/health/ready`, external `curl -fsS http://10.10.80.71/health/ready`, an HTTP 200 check for `/`, and inspect the latest application logs for startup errors.
