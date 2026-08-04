# ADR 0009: AI sends client email under deterministic gates

## Context

ADR 0003 constrained the local LLM to advisory proposals only, with human gates before orders, filesystem writes, and most outbound email. Product Phase 4 requires:

1. Automatic in-thread conversation replies before an order exists.
2. Automatic creation of an Unassigned order (plus download) when an email is classified as an order and contains file links.
3. System auto-send of confirmation, ETA, and query emails after a CS decision (or for conversation policy), without a second outbound approve click.

These behaviours conflict with the letter of ADR 0003 and with ADR 0007’s “only two system templates” rule.

## Decision

ADR 0003 remains in force for local-only models, Zod-validated untrusted output, deterministic ownership of client match and link extraction, and the ban on inventing ETA, prices, or commitments.

This ADR **supersedes ADR 0003 and narrows ADR 0007** for the following behaviours only:

1. **Conversation auto-reply** — After inbound ingest, the system may draft and system-approve `CONVERSATION_REPLY` in the same Gmail thread without a CS click, subject to pause, loop caps, and self-address guards.
2. **Order auto-creation at ingest** — When classification is `ORDER`, file link(s) exist, and the client is known, the system creates an `UNASSIGNED` order (or adds a batch), queues download, and system-approves `RECEIPT_ACKNOWLEDGEMENT`. CS still must Approve before `IN_PRODUCTION`.
3. **System auto-send after CS intent** — Templates `ORDER_CONFIRMATION`, `ETA_UPDATE`, and `QUERY_REPLY` are drafted (AI preferred, deterministic fallback) and system-approved when CS approves, sets/changes ETA, or sends a query. No second outbound approval UI.

All AI output remains untrusted: validated, guarded against unsafe commitments, and replaced by deterministic templates on failure. Classification failure never escalates to `ORDER`. Pause blocks drafting and outbound claiming for the thread.

## Alternatives considered

- Keep human outbound approve for confirmation/ETA/query — rejected: duplicates CS intent and slows the workflow.
- Cloud LLM — rejected: local-only policy.
- Create orders only after CS approve — rejected: download must start on order-email ingest.

## Consequences

- Outbound system auto-approve is no longer limited to receipt and files-verified.
- Inbox and order UI remove freeform status progression and human outbound approve for these templates.
- ADR 0003 Status is annotated as superseded in part.
- ADR 0007’s exclusive list of system templates is extended by this ADR.

## Status

Accepted

## Date

2026-07-27
