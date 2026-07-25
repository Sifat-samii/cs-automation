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

Phase 0 (project foundation) is in progress on branch `feature/project-foundation`. Application packages are not scaffolded yet. See [docs/implementation-status.md](docs/implementation-status.md).

## First-time setup (after Phase 0 tooling lands)

```powershell
npm ci
# Copy .env.example to .env and fill in secrets locally — never commit .env
npm run db:generate
npm run db:migrate:deploy
npm run db:seed
npm run verify
npm run dev --workspace @cs/web
```

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
