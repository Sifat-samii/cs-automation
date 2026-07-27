# n8n Google Sheets mirror (Phase 5)

Transport-only workflow: Postgres remains authoritative. n8n never writes into the database except via the HMAC done callback.

## Prerequisites

- Layout capture: [`google-sheet-layout.md`](./google-sheet-layout.md)
- Web app on `http://127.0.0.1:3100`
- n8n env:
  - `INGEST_HMAC_SECRET` — same as the web app
  - `GOOGLE_SHEETS_SPREADSHEET_ID` — copy workbook ID only
  - `NODE_FUNCTION_ALLOW_BUILTIN=crypto`
  - `N8N_BLOCK_ENV_ACCESS_IN_NODE=false`
- OAuth credential named **`SHARED_CS_GOOGLE_SHEETS_OAUTH`** (no tokens in git)

## Import

1. Import [`n8n/workflows/google-sheets-mirror.json`](../../n8n/workflows/google-sheets-mirror.json) (`active: false`).
2. Attach the Sheets OAuth credential to both Google Sheets nodes.
3. Confirm the tab name is `Daily Order Pipeline`.
4. Keep Document **By ID** as `{{ $env.GOOGLE_SHEETS_SPREADSHEET_ID }}`. The editor may show
   “not accessible via UI” / “No columns found” — that is expected. The export embeds
   `columns.schema` and `columns.matchingColumns` (`Order Name`) so runtime does not need the UI
   column fetch. Re-import after pulling if you still see `Could not get parameter "columns.schema"`.

## Behaviour

1. Schedule → HMAC GET `/api/mirror/pending`
2. For each claim: Google Sheets **append or update** matching **`Order Name`**, writing only Date / Client / Order Name / Quantity
3. If `blankRowAfter` is true, append one empty row (group spacer)
4. HMAC POST `/api/mirror/:id/done` with `providerRowKey=order-name:<Order Name>`

## Dry-run

Follow the checklist in `google-sheet-layout.md`. Use a **copy** of the production sheet until verified.
