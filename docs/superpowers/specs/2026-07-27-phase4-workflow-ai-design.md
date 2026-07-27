# Phase 4: Workflow Rewrite + Local AI Orchestration

**Date:** 2026-07-27  
**Status:** Approved for implementation  
**Branch:** `feature/client-folder-ux` (Phase 4 work continues on the active integration branch)

## Goal

Rewrite the CS order workflow so that:

1. Order emails with links are ingested as **Unassigned** orders, receipt-acked, and downloaded immediately.
2. CS only decides: approve with ETA, approve without ETA, or send a query.
3. Approved orders move to **In Production**; ETA is a locked tag, not a status.
4. Local Ollama classifies mail and drafts client-facing replies that the system auto-sends under deterministic gates.
5. **Ready to Upload** is the stub terminal (upload pipeline deferred).

## Locked decisions

| Decision                 | Choice                                                           |
| ------------------------ | ---------------------------------------------------------------- |
| Outbound after CS intent | AI drafts + system auto-sends (no second click)                  |
| Pre-order conversation   | AI auto-replies in-thread (no CS click)                          |
| Order email rule         | AI classifies `ORDER` **and** file link(s) present               |
| AI runtime               | Local Ollama (`qwen3:8b` default; bake-off vs `4b`)              |
| Unknown client           | AI may chat + human review; no order / download                  |
| Statuses                 | `UNASSIGNED` → `IN_PRODUCTION` → `READY_TO_UPLOAD`               |
| ETA                      | Tags `ETA Required` / `ETA Sent`; lock + change-reason emails    |
| Manual status            | Approve → In Production; Ready to Upload from In Production only |
| Cancel                   | None                                                             |
| Pause / Resume           | Emails only; transfers continue                                  |

## Architecture summary

- **Postgres** remains source of truth.
- **n8n** remains transport only (poll / send / sheets).
- **File Agent** owns share writes.
- **AI** lives in `apps/web/src/lib/ai/` (Ollama). Output is Zod-validated and untrusted.
- Deterministic rules still own client match and link extraction.
- Ingest is **two-phase**: short DB transaction to persist, then orchestration outside the transaction (so Ollama never holds locks).

## Order statuses

- `UNASSIGNED` — order email intake complete (ack + download queued); awaiting CS approve.
- `IN_PRODUCTION` — CS approved (with or without ETA).
- `READY_TO_UPLOAD` — CS pressed Ready to Upload (stub final).

### ETA tags (derived)

- `IN_PRODUCTION` and `etaSentAt == null` → **ETA Required**
- `etaSentAt != null` → **ETA Sent**
- `UNASSIGNED` → no ETA tag

### Pause

`MailThreadState.paused` and/or `Order.communicationPaused` block all client-facing outbound for that Gmail thread. Enforced at draft time and at outbound claim time.

## Outbound templates

Kept: `RECEIPT_ACKNOWLEDGEMENT`, `FILES_VERIFIED` (system auto).  
Added: `ORDER_CONFIRMATION`, `ETA_UPDATE`, `CONVERSATION_REPLY`, `QUERY_REPLY` (system auto under ADR 0009).  
Historical: `ACKNOWLEDGEMENT`, `ETA_NOTICE` remain in the enum but are no longer drafted.

## Failure and safety

- Classification failure never escalates to `ORDER`.
- Path-budget / create failures degrade to `NEEDS_HUMAN` (ingest still returns success).
- Per-thread auto-reply cap and self-address guard prevent mail loops.
- AI drafts that invent dates/prices/commitments fall back to deterministic templates.
- Pause suppresses email; state transitions still apply.

## Out of scope

- Upload / delivery pipeline after Ready to Upload.
- Cloud LLMs.
- Cancel / CLOSED beyond migration mapping.
- File Agent pipeline internals.
- New Google Sheet columns.

## Related

- ADR 0009 (supersedes ADR 0003 in part)
- ADR 0007 (system auto-outbound; extended by 0009)
- Implementation plan: Cursor plan `phase_4_final`
