# ADR 0008: Phase 5 clients UX before Google Sheets mirror

## Context

The Phase 5 roadmap originally centred on Google Sheets sync. Operators also need a usable client registry (list, detail with order buckets, inbox registration of unknown senders) before AI assistance. Live sheet column layout is not yet captured, so mirror code must not invent production columns.

## Decision

- Ship client registry UX as **Phase 5 Wave A** on `feature/google-sheets-sync`.
- Keep **Phase 4 AI** deferred; AI remains advisory-only when it ships (ADR 0003).
- Gate **Wave B** Sheets mirror on `docs/integrations/google-sheet-layout.md` capturing the live tab, headers, and order-code key column.
- PostgreSQL remains the only source of truth; Sheets is a one-way projection when implemented.

## Alternatives considered

- Defer client UI until after Sheets — rejected: inbox and order work needs registry first.
- Invent sheet columns from memory — rejected: fragile and unsafe against the live workbook.
- Bundle AI into Phase 5 — rejected: not required for core automation; deferred explicitly.

## Consequences

- Wave A can merge independently of Sheets credentials and layout capture.
- Wave B stops at a BLOCKED layout stub until an operator records the live sheet.

## Status

Accepted

## Date

2026-07-26
