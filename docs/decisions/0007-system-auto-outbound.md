# ADR 0007: System auto-send for receipt and files-verified mail

## Context

Phase 3 originally required a recorded human approval on every `OutboundEmail` before n8n could send. The intake redesign requires:

1. An immediate receipt acknowledgement when a client email is ingested.
2. An automatic files-verified confirmation after successful batch verification.

Waiting for a CS click on those two messages delays the client and duplicates work already covered by the inbox review gate (for order creation) and deterministic verification (for file success).

## Decision

System auto-approval is allowed **only** for:

- `RECEIPT_ACKNOWLEDGEMENT` (created on ingest, may have null `orderId`, linked via `emailMessageId`)
- `FILES_VERIFIED` (created after `VERIFY_PRODUCTION` succeeds)

System approval sets `status=APPROVED`, `approvedAt=now()`, `approvedById=null`, and audits with actor `system:auto-outbound`. The outbound pending claim accepts any `APPROVED` row with `approvedAt` set. The database check constraint requires `approvedAt` for non-draft rows but no longer requires `approvedById`.

All other templates (`ACKNOWLEDGEMENT`, `ETA_NOTICE`, and any future templates) remain human-gated. Orders, filesystem writes, and transfer jobs still require CS proposal approval.

## Alternatives considered

- Human approve every outbound — rejected for this redesign: too slow for receipt and duplicate effort after verification.
- Auto-send all outbound — rejected: ETA and ad-hoc client mail stay human-controlled.
- Draft-only receipt with human send — rejected by product decision (auto-send on receive).

## Consequences

- ADR 0003’s “before … outbound email exists” rule is narrowed: proposals still gate orders/filesystem; these two machine templates may leave the system without a human outbound click.
- n8n send workflow must remain inactive until HMAC and Gmail dry-runs succeed.
- Download failure notification stays in-app only (no auto failure email).

## Status

Accepted

## Date

2026-07-26
