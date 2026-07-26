# Google Sheet layout (Phase 5 Wave B gate)

## Status

**BLOCKED — layout not captured**

Wave B mirror schema, projection, HMAC APIs, and n8n Sheets workflow must not be implemented until this document records the live production sheet layout. Do not invent columns.

## Required capture (operator)

Fill from the live Google Sheet only:

| Field | Value |
| ----- | ----- |
| Capture date (UTC) | _not captured_ |
| Operator | _not captured_ |
| Tab name | _not captured_ |
| Header row (left-to-right, exact titles) | _not captured_ |
| Order-code key column | _not captured_ |
| Append vs update rules | _not captured_ |

## Environment (not committed)

- Spreadsheet ID: `GOOGLE_SHEETS_SPREADSHEET_ID` in env / n8n credentials only.

## Notes

- PostgreSQL remains the source of truth.
- Sheets is a one-way projection after this gate clears.
