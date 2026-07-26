# Implementation status

| Phase | Name                | Branch                        | Status      |
| ----- | ------------------- | ----------------------------- | ----------- |
| 0     | Project foundation  | `feature/project-foundation`  | Complete    |
| 1     | Manual order intake | `feature/manual-order-intake` | Complete    |
| 2     | File agent          | `feature/file-agent`          | Not started |
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

## Phase 1 runtime limitation

The Codex-sandboxed dev-server process received `EPERM` while enumerating the approved backup
test root, so the new-client page's live existing-folder selection could not be completed in that
browser process. A read-only host-context check enumerated `DPBP`, `FN`, and `Vrly` under the
approved `_Software Test` root, and automated service tests cover existing-folder filtering and
binding. The deployed web process must run under an account that can read the backup root.

Last updated: 2026-07-26
