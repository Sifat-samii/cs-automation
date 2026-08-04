# Phase 4 go-live runbook

## Preconditions

1. PostgreSQL running with migrations applied (`npm run db:migrate:deploy`).
2. Ollama installed and model pulled: `ollama pull qwen3:8b`.
3. Web app env includes `INGEST_HMAC_SECRET`, UNC roots, `STAGING_ROOT`, and optional AI keys from `.env.example`.
4. File Agent configured with the same HMAC secret and `FILE_AGENT_API_BASE_URL` pointing at the web app.
5. n8n has Gmail OAuth and Google Sheets OAuth credentials ready (never commit them).

## Start order

1. Start Postgres.
2. Start Ollama (`ollama serve` if not already a service).
3. Start the web app (`npm run dev --workspace @cs/web -- -p 3100` or production start).
4. Start the File Agent.
5. Start n8n with matching `INGEST_HMAC_SECRET` and `GOOGLE_SHEETS_SPREADSHEET_ID`.

## Activate workflows

Import (or re-import) from `n8n/workflows/`:

- `gmail-poll.json`
- `gmail-send.json`
- `google-sheets-mirror.json`

Re-attach OAuth credentials on Gmail and Sheets nodes. Set the poll HTTP request timeout to **at least 2 × `AI_TIMEOUT_MS` + 10 s** (default 60 000 → use **130 000 ms**) because the Ollama client retries once on transport error. Activate all three workflows.

## Smoke checklist

1. **Conversation email** (known client, no file link) → AI/conversation reply queued; no order created.
2. **Order email** (known client + Dropbox/Drive link) → Unassigned order created, receipt ack approved, download queued.
3. **Approve with ETA** → status In Production, ETA Sent tag, confirmation outbound.
4. **Approve without ETA** → In Production, ETA Required tag; later Set ETA → ETA_UPDATE outbound.
5. **Send query** on Unassigned → QUERY_REPLY outbound; status stays Unassigned.
6. **Pause Order** → no further outbound claimed for the thread; transfers continue.
7. **Resume Order** → outbound claim resumes.
8. **Ready to Upload** from In Production only → terminal stub status.

## Failure notes

- If Ollama is down, classification with links escalates to Needs Human; confirmation/query fall back to deterministic templates.
- Path-budget failures during auto-create leave a Needs Human proposal; ingest still returns success so n8n does not retry forever.
- Never auto-delete downloaded files on a wrong intake — Pause and review.
