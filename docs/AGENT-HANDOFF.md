# Agent handoff (Codex / Cursor)

## What to implement

Implement **Phase 0 only** from:

`docs/superpowers/plans/2026-07-26-cs-automation-phase-0.md`

Read first:

- `docs/specs/2026-07-26-cs-automation-design.md`
- `docs/decisions/` (ADRs 0001–0005)

## Hard rules

1. One task at a time. Finish Task N (including its commit, unless the human says otherwise) before Task N+1.
2. Follow each step: failing test → implement → pass → verify → commit.
3. Do **not** invent order intake, Gmail, n8n workflows, AI extraction, or `apps/file-agent` in Phase 0.
4. Shell is PowerShell 5.1: never use `&&`; use `;` or separate commands.
5. Never use `X:` or `Z:` — UNC paths only (see Global Constraints in the plan).
6. No secrets in git. `.env` stays local; only `.env.example` is committed.
7. Do not weaken TypeScript strictness (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `no-explicit-any`).
8. If something conflicts with the plan, stop and ask — do not reinterpret scope.

## Naming note

This plan is **Phase 0 (foundation)**. Manual order intake is **Phase 1** (separate later plan).

## Current branch

`feature/project-foundation`

## Next step after this commit

Start **Task 2** (monorepo tooling) in the Phase 0 plan.
