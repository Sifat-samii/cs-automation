# Google Sheet layout (Phase 5 Wave B gate)

## Status

**CAPTURED** — from operator export `Daily Order Pipeline - Daily Order Pipeline.csv` (2026-07-26).

## Capture metadata

| Field              | Value                                                           |
| ------------------ | --------------------------------------------------------------- |
| Capture date (UTC) | 2026-07-26                                                      |
| Operator           | Sifat                                                           |
| Source             | Copy of production “Daily Order Pipeline” workbook (CSV export) |
| Tab name           | `Daily Order Pipeline`                                          |

## Header row (left-to-right)

Canonical header row (workbook row 1):

| A         | B           | C    | D      | E          | F        | G        | H        | I                | J                | K        | L      | M            | N          |
| --------- | ----------- | ---- | ------ | ---------- | -------- | -------- | -------- | ---------------- | ---------------- | -------- | ------ | ------------ | ---------- |
| _(blank)_ | Delivery BY | Date | Client | Order Name | Quantity | Status 1 | Status 2 | Notes/Comments 1 | Notes/Comments 1 | QC Start | QC End | 2nd QC Start | 2nd QC End |

Section divider rows later in the sheet sometimes restate headers as `Client's Name` / `Order List`. **Automation always writes using the canonical titles:** `Date`, `Client`, `Order Name`, `Quantity`.

## Columns the system may write

| Column | Header     | Postgres source                                              |
| ------ | ---------- | ------------------------------------------------------------ |
| C      | Date       | `Order.createdAt` formatted `DD/MM/YYYY` (UTC calendar date) |
| D      | Client     | `Client.displayName`                                         |
| E      | Order Name | `Order.title`                                                |
| F      | Quantity   | `Order.quantity` as decimal string; empty string when null   |

**Do not write** Delivery BY, Status, Notes, QC columns, or any other field. Production owns those cells.

## Update-or-append key

There is **no dedicated order-code column** on this sheet.

- Lookup / match column: **`Order Name`** (column E)
- If a row with the same Order Name exists → **update** only Date, Client, Order Name, Quantity
- Otherwise → **append** (see placement rules)
- Postgres `Order.code` is kept in the outbox payload for reconciliation only; it is **not** written to the sheet

## Row placement (append)

Observed live pattern and operator rule:

1. After a standalone order, **skip one blank row** before the next unrelated order.
2. When **multiple orders are placed together** (same client, same calendar Date in one mirror claim batch), write them on **consecutive rows**, then skip **one blank row** after the group.

Examples from the export: consecutive FN / FSA / Christopher Shintani blocks with a blank row after the block.

## Environment (not committed)

- Spreadsheet ID: `GOOGLE_SHEETS_SPREADSHEET_ID` in env / n8n credentials only.
- n8n Google Sheets OAuth credential placeholder name: `SHARED_CS_GOOGLE_SHEETS_OAUTH`.

## Dry-run checklist

1. Point n8n at a **copy** workbook (never production until verified).
2. Set `GOOGLE_SHEETS_SPREADSHEET_ID` and `INGEST_HMAC_SECRET` in n8n env.
3. Import `n8n/workflows/google-sheets-mirror.json` (inactive).
4. Create a test order in the app → confirm `SheetMirrorOutbox` row `PENDING`.
5. Manually execute the workflow once → row appears under Date/Client/Order Name/Quantity only; Status columns untouched.
6. Re-run for the same Order Name → same sheet row updated (no duplicate).
7. Create two same-client orders in one claim window → consecutive rows, then one blank.
8. Mark done callbacks leave outbox `DONE` with `providerRowKey`.
