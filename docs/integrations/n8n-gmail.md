# n8n Gmail transport

Phase 3 keeps n8n transport-only. PostgreSQL and the web application own ingest idempotency,
proposals, human decisions, and outbound state. Receipt acknowledgements and files-verified
confirmations are system-approved (ADR 0007) and appear on the pending outbound queue without a
CS outbound click.

## Prerequisites

- n8n installed as a Windows service on the CS host
- shared-mailbox Gmail OAuth credential created in n8n
- the service environment contains the same `INGEST_HMAC_SECRET` as the web application
- the n8n Code node may load Node's `crypto` module
  (`NODE_FUNCTION_ALLOW_BUILTIN=crypto` in the n8n service environment)
- `N8N_BLOCK_ENV_ACCESS_IN_NODE=false` so Code nodes can read `INGEST_HMAC_SECRET`
- the web application is reachable from the service at `http://127.0.0.1:3100`

Never paste the HMAC secret or OAuth token into a workflow export.

## Import

1. Import `n8n/workflows/gmail-poll.json`.
2. Import `n8n/workflows/gmail-send.json`.
3. Open each Gmail node and select the shared-mailbox OAuth credential. The export uses the
   non-secret placeholder name `SHARED_CS_GMAIL_OAUTH`.
4. Keep both workflows inactive and execute each manually.
5. For poll, confirm a **new** test message produces HTTP `201` with `duplicate: false`. Re-running
   the same message must produce `200` with `duplicate: true`.
6. For send, confirm the pending call returns the new receipt (not an empty `outbound` array). The
   Gmail node must use `emailType: html` and **Append n8n attribution** turned off.
7. Confirm pilot-approved templates are loaded (no `GATE_BLOCKED_PLACEHOLDER` in rendered
   drafts; bodies are HTML with paragraph breaks) and run the application verification suite
   before approving any human-gated draft.
8. After a successful receipt send, confirm Gmail shows the reply in-thread, then activate
   schedules only when ready for continuous pilot traffic.

## Poll design (important)

The poll export uses **Schedule → Gmail Get Many → Normalize → HMAC ingest**, not a Gmail
Trigger. Manual “Execute workflow” always queries Gmail again (no trigger poll cursor).

Default Get Many filters:

- Search: `newer_than:2d -category:promotions -category:social`
- Read status: **Unread and read** (so opening the mail in Gmail does not hide it from poll)
- Limit: 25
- Simplify: off (full message body for ingest)
- Download attachments: off (metadata only via normalize)

Already-ingested messages are safe to re-poll: the app returns `200` / `duplicate: true` and does
not create a second inbox row or a second receipt outbound.

## Dry-run checklist

1. Web app running on port 3100 with the same HMAC secret as n8n.
2. Send a new inbound message into the **same** Gmail account bound to the OAuth credential.
3. Execute **poll** once.
4. In the web terminal, look for `POST /api/ingest/email 201` (not only `200`).
5. Open `/inbox` — the new message should appear as `UNREVIEWED`.
6. Execute **send** once — Gmail node should run (green). Receipt uses HTML body and no n8n footer.
7. If send stops after Split Outbound, open **GET Approved Outbound**: empty `outbound` means
   nothing is `APPROVED` (ingest did not create a new receipt, or rows are already `SENDING`/`SENT`).

## Safety contract

- Machine routes accept HMAC only; browser session cookies provide no authority.
- Poll uses `Idempotency-Key: <gmailMessageId>` and is safe to replay.
- Poll reads attachment names, MIME types, and sizes from raw Gmail MIME-part metadata without
  downloading or storing attachment binaries.
- The outbound API locks eligible `APPROVED` rows with `FOR UPDATE SKIP LOCKED`, transitions each
  valid row to `SENDING`, and returns it to exactly one poller.
- Invalid rows are moved to `FAILED` individually, so one missing recipient cannot block other
  outbound mail.
- `SENDING` rows are never automatically reclaimed. If Gmail succeeds but the signed callback
  fails, the row remains quarantined from further sends until an operator reconciles its Gmail
  thread and records the provider message id.
- Placeholder copy cannot transition from `DRAFT` to `APPROVED`.
- The send workflow passes `gmailThreadId` to Gmail and calls the signed sent callback only after
  Gmail returns a provider message id.
- Both exported workflows are inactive by default.

The ingest burst limiter is process-local by design for the single Next.js instance on this host.
Replace it with a shared database or Redis limiter before any horizontally scaled deployment.
