# n8n Gmail transport

Phase 3 keeps n8n transport-only. PostgreSQL and the web application own ingest idempotency,
proposals, human decisions, and outbound state.

## Prerequisites

- n8n installed as a Windows service on the CS host
- shared-mailbox Gmail OAuth credential created in n8n
- the service environment contains the same `INGEST_HMAC_SECRET` as the web application
- the n8n Code node may load Node's `crypto` module
  (`NODE_FUNCTION_ALLOW_BUILTIN=crypto` in the n8n service environment)
- the web application is reachable from the service at `http://127.0.0.1:3100`

Never paste the HMAC secret or OAuth token into a workflow export.

## Import

1. Import `n8n/workflows/gmail-poll.json`.
2. Import `n8n/workflows/gmail-send.json`.
3. Open each Gmail node and select the shared-mailbox OAuth credential. The export uses the
   non-secret placeholder name `SHARED_CS_GMAIL_OAUTH`.
4. Keep both workflows inactive and execute each manually.
5. For poll, confirm a test message produces `201`; re-running it must produce `200` with
   `duplicate: true`.
6. For send, confirm the pending call returns no `DRAFT` rows.
7. Replace the three `GATE_BLOCKED_PLACEHOLDER` templates with owner-approved copy and run the
   application verification suite before approving any draft.
8. Approve one non-production draft, execute the send workflow manually, and confirm Gmail returns
   a message id in the original thread before activating either schedule.

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
