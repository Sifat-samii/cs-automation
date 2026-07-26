# Agent handoff (Codex / Cursor)

## Current state

Phases 0 and 1 are complete and merged into `develop`.

- Phase 0: project foundation, security utilities, Prisma authentication/audit schema, protected
  dashboard, CI, and SMB benchmark
- Phase 1: path and lifecycle contracts, order-domain schema, client registry, transactional order
  services, batch/ETA handling, and the role-protected manual intake UI
- Quality gate: 18 Vitest files and 147 tests, strict TypeScript, ESLint, Prettier, all package
  builds, and the Next.js production build pass
- Running state: port 3100 returns the login page; protected routing works; an authenticated
  `CS_LEAD` can load the dashboard and new-client page; the live page enumerates `DPBP`, `FN`, and
  `Vrly` from the approved backup test root
- GitHub: Phase 1 PR #1 merged into `develop` after green CI

Read and follow:

- `docs/superpowers/plans/2026-07-26-cs-automation-full-roadmap.md`
- `docs/implementation-status.md`
- `docs/specs/2026-07-26-cs-automation-design.md`
- `docs/decisions/` (ADRs 0001–0005)

## Hard rules

1. Execute one phase and one task at a time, with a Conventional Commit after each task.
2. Follow failing test → minimal implementation → focused pass → broader verification.
3. Shell is PowerShell 5.1: never use `&&`; use `;` or separate commands.
4. Use only the approved UNC roots; never introduce mapped-drive paths.
5. No secrets in git. Local environment files stay untracked.
6. Keep strict TypeScript and `@typescript-eslint/no-explicit-any`.
7. Do not begin a phase until every entry-gate condition in the full roadmap is verified.

## Current branch

`develop`

## Next step

Evaluate the Phase 2 entry gate. The SMB benchmark is complete. Before creating
`feature/file-agent`, verify a Windows service account has read/write access to the approved
`_Software Test` roots and record the Dropbox/Google Drive credential decision. Do not treat
interactive host-account read access as proof of service-account write access.
