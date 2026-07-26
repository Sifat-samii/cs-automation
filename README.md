# CS Automation

On-prem automation for the Client Support team: Gmail intake, human-approved order creation, verified file placement on backup and production shares, and client acknowledgement / ETA emails. PostgreSQL is the source of truth; n8n handles Gmail transport; a Windows File Agent performs UNC transfers. Final upload to the client stays manual.

## Prerequisites

- Node.js 24+
- npm 12+
- PostgreSQL 18
- PowerShell 5.1+ (Windows)
- Git 2.54+

**PowerShell note:** Windows PowerShell 5.1 does **not** support `&&` as a statement separator. Chain commands with `;` or run them on separate lines.

## Current status

Phase 0 (project foundation) is implemented and verified on branch
`feature/project-foundation`. It includes the npm workspaces monorepo, shared security
utilities, PostgreSQL schema and append-only audit enforcement, staff-ID authentication,
protected dashboard shell, CI workflow, and SMB transfer benchmark. The branch is pending
integration into `develop`.

See [docs/implementation-status.md](docs/implementation-status.md) for verification results.

## Workspace

- `packages/shared` — environment validation, HMAC helpers, and Argon2id password hashing.
- `packages/db` — Prisma schema, migrations, seed, client, and test-only database reset helper.
- `apps/web` — Next.js login and protected dashboard shell.

Order intake, file-agent operations, Gmail integration, AI assistance, and Sheets sync are not
part of Phase 0.

## First-time setup

```powershell
npm ci
# Copy .env.example to .env, .env.test, and apps/web/.env.local.
# Fill in local values and never commit those files.
npm run db:generate

# Set DATABASE_URL in this shell before Prisma migration or seed commands.
npm run db:migrate:deploy
npm run db:seed

npm run verify
npm run dev --workspace @cs/web
```

The bootstrap account signs in with its unique staff ID. The current shared initial password is
temporary and must be replaced before the app is exposed beyond the trusted office LAN. Passwords
are stored only as Argon2id hashes.

## Paths (UNC only)

Never configure `X:` or `Z:` for automation. Use:

- Backup: `\\192.168.0.15\Production\File Transfer Server\Sifat_Project Coordinator\Software test\_Software Test`
- Production: `\\192.168.0.15\Production\File Server\_Share Work\2026\_Software Test`

## Documentation

- [Design spec](docs/specs/2026-07-26-cs-automation-design.md)
- [Architecture](docs/architecture.md)
- [Project context](docs/project-context.md)
- [Risks](docs/risks.md)
- [Unresolved questions](docs/unresolved-questions.md)
- [Decisions (ADRs)](docs/decisions/)
- [Phase 0 implementation plan](docs/superpowers/plans/2026-07-26-cs-automation-phase-0.md)

## Branching

```text
main
develop
feature/project-foundation   # Phase 0
feature/manual-order-intake
feature/file-agent
feature/gmail-integration
feature/ai-assistance
feature/google-sheets-sync
```
