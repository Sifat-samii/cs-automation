# Agent handoff (Codex / Cursor)

## Current state

Phases 0 and 1 are complete and merged into `develop`. Phase 2 is complete and review-hardened on
`feature/file-agent`; it is not yet merged into `develop`. Phase 3 is implemented and locally
verified in the current working tree, with live activation still entry-gated.

- Phase 0: project foundation, security utilities, Prisma authentication/audit schema, protected
  dashboard, CI, and SMB benchmark
- Phase 1: path and lifecycle contracts, order-domain schema, client registry, transactional order
  services, batch/ETA handling, and the role-protected manual intake UI
- Phase 2: exhausted-lease terminalisation, attempt-fenced HMAC agent API and scratch paths,
  mid-transfer progress, collision-safe streaming downloads, ZIP and manifest verification,
  atomic backup/production publication, Windows service installer, and coordinated operator UI
- Phase 3: idempotent HMAC Gmail ingest, deterministic proposals, review inbox, atomic approval,
  outbound approval/send state, verified/ETA drafts, and inactive n8n poll/send exports
- Phase 3 plan: `docs/superpowers/plans/2026-07-26-cs-automation-phase-3.md`
- Quality gate: 37 Vitest files and 235 tests, strict TypeScript, ESLint, Prettier, all package
  builds, and the Next.js production build pass
- Running state: port 3100 returns the login page; protected routing works; an authenticated
  `CS_LEAD` can load the dashboard and new-client page; the live page enumerates `DPBP`, `FN`, and
  `Vrly` from the approved backup test root
- GitHub: Phase 1 PR #1 merged into `develop` after green CI; the Phase 2 branch still requires its
  PR and merge

Read and follow:

- `docs/superpowers/plans/2026-07-26-cs-automation-full-roadmap.md`
- `docs/superpowers/plans/2026-07-26-cs-automation-phase-3.md` (when starting Phase 3)
- `docs/implementation-status.md`
- `docs/specs/2026-07-26-cs-automation-design.md`
- `docs/decisions/` (ADRs 0001–0006)
- `docs/integrations/n8n-gmail.md` (workflow import, credentials, and fail-closed activation)

## Hard rules

1. Execute one phase and one task at a time, with a Conventional Commit after each task.
2. Follow failing test → minimal implementation → focused pass → broader verification.
3. Shell is PowerShell 5.1: never use `&&`; use `;` or separate commands.
4. Use only the approved UNC roots; never introduce mapped-drive paths.
5. No secrets in git. Local environment files stay untracked.
6. Keep strict TypeScript and `@typescript-eslint/no-explicit-any`.
7. Do not begin a phase until every entry-gate condition in the full roadmap is verified.
8. Do not invent client email subject/body copy; Phase 3 send stays blocked on placeholders.

## Current branch

`docs/phase-3-plan` (from `feature/file-agent`, carrying Phase 2 hardening + Phase 3 plan docs).
The current working tree also contains the locally verified Phase 3 implementation. Preserve
unrelated existing changes when splitting or committing this work.

Phase 3 directly hooks the Phase 2 `VERIFY_PRODUCTION` completion transaction to draft follow-up
mail. Do not publish Phase 2 and Phase 3 as independent histories from this dirty tree: merge Phase
2 first, then rebase the Phase 3 changes onto that exact merged head, or ship the combined history
in dependency order.

## Next step

1. Commit and merge Phase 2 review hardening into `develop` (CI green).
2. Split or rebase the verified Phase 3 implementation onto `feature/gmail-integration` from the
   updated `develop` without losing the current dirty-tree work.
3. Install n8n as a Windows service, complete shared-mailbox Gmail OAuth, and paste owner-approved
   wording for `ACKNOWLEDGEMENT`, `FILES_VERIFIED`, and `ETA_NOTICE`.
4. Follow `docs/integrations/n8n-gmail.md` for manual dry-run verification before activating either
   workflow.
5. Before production File Agent activation, IT must replace the interim `TUDB01\Designer-TUUO`
   identity with `.\CS_FileAgent` (or approved domain equivalent). Do not install the service as
   LocalSystem.
