# Project context

## What this system replaces

The Client Support (CS) team handles image-retouching orders for external clients. Today the process is manual and easy to make messy.

## How orders arrive

Clients place orders in either of two ways:

1. The Pixofix portal (upload or Dropbox/Google Drive link).
2. Directly by email with a Dropbox/Drive link. Gmail is the primary communication channel. One shared CS mailbox is used by the whole team.

Most follow-up for a given order stays on the same Gmail thread. Clients sometimes send a new email and mention the order name so CS can find the right job.

## What CS does today

1. See the email (or portal order).
2. Record details in a Google Sheet (order name, folder name, quantity, type, and related fields).
3. Send an order-received confirmation.
4. Download files into the backup share, then copy them to the production share for the production department.
5. Ask production head for an ETA and send that ETA to the client.
6. When production finishes, upload the Ready-to-upload folder back to the client Dropbox or portal — **this final upload stays manual** (human verification before delivery).

## Messy but normal scenarios

- Additional files for the same order later.
- Sample requests: sample files out, client reviews, then full order files.
- Additional instructions after order placement.
- Corrections after submission.

These must attach to an existing order rather than spawning unrelated one-off processes.

## Tracking today

Google Sheets is the operational board the production head reads. Until a Postgres → Sheets mirror exists, orders created only in the app are invisible to production.
