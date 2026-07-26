# Implementation status

| Phase | Name                | Branch                        | Status      |
| ----- | ------------------- | ----------------------------- | ----------- |
| 0     | Project foundation  | `feature/project-foundation`  | Complete    |
| 1     | Manual order intake | `feature/manual-order-intake` | Not started |
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

The implementation is complete on `feature/project-foundation`. GitHub integration remains
pending because `develop` and `main` do not yet exist on the remote and no pull request has been
opened.

Last updated: 2026-07-26
