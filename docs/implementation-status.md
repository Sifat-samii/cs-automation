# Implementation status

| Phase | Name                | Branch                        | Status      |
| ----- | ------------------- | ----------------------------- | ----------- |
| 0     | Project foundation  | `feature/project-foundation`  | Complete    |
| 1     | Manual order intake | `feature/manual-order-intake` | Complete    |
| 2     | File agent          | `feature/file-agent`          | Complete    |
| 3     | Gmail integration   | `feature/gmail-integration`   | Not started |
| 4     | AI assistance       | `feature/ai-assistance`       | Not started |
| 5     | Google Sheets sync  | `feature/google-sheets-sync`  | Not started |

## Phase 0 checklist

- [x] Git repository and branch structure
- [x] Design spec and ADRs
- [x] Monorepo tooling
- [x] Shared env + HMAC + password hashing
- [x] Prisma User/Session/AuditEvent
- [x] Staff-ID authentication + protected dashboard shell
- [x] CI workflow
- [x] SMB copy benchmark

## Phase 0 verification

- Clean install: `npm ci` installed the locked dependency graph successfully.
- Database: Prisma client generation passed; both migrations deploy cleanly to
  `cs_webapp_test`.
- Quality gate: strict TypeScript, ESLint, Prettier, Vitest, package builds, and the Next.js
  production build passed through `npm run verify`.
- Tests: 9 test files and 47 tests passed.
- Authentication: the seeded `CS_LEAD` account was manually verified through sign-in,
  protected dashboard access, and sign-out.
- Security: session tokens are stored only as SHA-256 hashes; login failures are
  non-enumerating and audited; `AuditEvent` rejects updates and deletes at database level.
- Secret scan: the local database credential, PEM private-key markers, GitHub token patterns,
  and ignored environment files were absent from tracked Git history.
- SMB decision: validated 2,000 MiB copies selected robocopy as the Phase 2 primary transfer
  mechanism; benchmark folders were removed and their absence verified.

Phase 0 is integrated into `develop`.

## Phase 1 checklist

- [x] UNC-safe path building, sanitisation, extended-length conversion, and path budgets
- [x] Order and batch lifecycle state machines
- [x] Client, identity, order, batch, source-link, and append-only order-event schema
- [x] Client registry with exact-address and domain resolution
- [x] Collision-safe transactional order creation
- [x] Batch creation, ETA handling, and lifecycle mutation services
- [x] Role-protected manual client and order UI
- [x] Runtime, database, and quality-gate verification

## Phase 1 verification

- Quality gate: `npm run verify` passes strict TypeScript, ESLint, Prettier, all package builds,
  Vitest, and the Next.js production build.
- Tests: 18 test files and 147 tests pass, including concurrent order sequencing, lifecycle
  rejection, transaction rollback, append-only events, redacted audits, actions, and RBAC.
- Database: the development and test databases report all three migrations applied with no
  pending migration or drift.
- Runtime flow: a seeded `CS_LEAD` signed in, previewed and created an order, added an
  `ADDITIONAL` batch, set an ETA, and progressed the order from `DRAFT` through `CLOSED`.
- Traceability: the validation order stored seven ordered timeline events and seven
  correlation-matched audit records; every record named the acting user.
- Cleanup: the disposable runtime-validation records were removed by resetting the known
  development schema, then the bootstrap account was reseeded.
- Scope: Phase 1 stores computed paths but performs no filesystem writes.

## Phase 1 running-state verification

- The merged `develop` application starts successfully on port 3100 under the host account.
- `GET /login` returns 200, while an unauthenticated dashboard request redirects to `/login`.
- A short-lived authenticated `CS_LEAD` session loads `/dashboard` and `/clients/new` with 200
  responses.
- The live new-client page enumerates `DPBP`, `FN`, and `Vrly` from the approved backup test root.
- The diagnostic session token was stored only as a SHA-256 hash and revoked immediately after
  the check.
- Runtime logs contain no application error for these requests.

## Phase 2 checklist

- [x] Leased PostgreSQL transfer queue with `FOR UPDATE SKIP LOCKED`
- [x] HMAC-only agent job API with replay-window enforcement
- [x] Extended-length filesystem port and confined temporary implementation
- [x] Public Dropbox, credential-free Google Drive failure, and confirmed manual-drop adapters
- [x] ZIP integrity, path-budget, zero-byte, and SHA-256 staging verification
- [x] Atomic backup publication, marker files, robocopy production copy, and manifest verification
- [x] File Agent loop and NSSM Windows service installer
- [x] Five-second transfer monitoring, retry, and manual-drop operator controls
- [x] Live 2 GiB transfer, crash recovery, cleanup, and full quality gate

## Phase 2 verification

- Quality gate: strict TypeScript, ESLint, Prettier, Vitest, all package builds, and the Next.js
  production build pass through `npm run verify`.
- Tests: 29 test files and 194 tests pass, including concurrent leases, HMAC rejection paths,
  truncated downloads, HTML login bodies, deep/corrupt ZIPs, overwrite refusal, crash recovery,
  pipeline orchestration, operator controls, middleware routing, and manifest corruption.
- Database: the Phase 2 migration is applied to development and test with no pending migration.
- Live transfer: 8 × 256 MiB files (2 GiB) reached `VERIFIED` under the approved interim
  `TUDB01\Designer-TUUO` identity in the two `_Software Test` roots.
- Recovery: a killed `STAGE_VERIFY` lease expired naturally and was reclaimed on attempt 2.
- Integrity: 24 staged/backup/production artifact rows held matching SHA-256 manifests; both roots
  had 8 files and 2,147,483,648 bytes, matching markers, and no partial transfer directory.
- Throughput: the corrected full retry averaged 14.11 MiB/s; production copy plus promotion
  verification averaged 30.95 MiB/s.
- Robocopy compatibility: ADR 0006 records why normal UNC is used only at the robocopy process
  boundary; all Node filesystem operations remain extended-length.
- Cleanup: both E2E share folders, both staging folders, the disposable test records, background
  processes, and local runtime logs were removed after evidence capture.

Phase 2 is complete on `feature/file-agent`. Deployment remains interim until IT provisions the
dedicated `.\CS_FileAgent` account and grants its required rights.

Last updated: 2026-07-26
