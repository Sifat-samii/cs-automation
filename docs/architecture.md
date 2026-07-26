# Architecture

## Deployment

Everything for the MVP runs on one on-prem Windows box (`TUDB01`):

| Process                        | Role                                     |
| ------------------------------ | ---------------------------------------- |
| Next.js app (`apps/web`)       | CS UI, APIs, approvals, job enqueue      |
| PostgreSQL 18                  | Source of truth                          |
| n8n (npm, Windows service)     | Gmail poll/send, later Sheets mirror     |
| Ollama                         | Local advisory extraction only           |
| File Agent (`apps/file-agent`) | Downloads, staging, UNC writes — Phase 2 |

No Docker in Phase 0 (Docker is not installed on the box).

## Trust boundaries

- **Postgres** owns business state.
- **n8n** is transport only; HMAC-signed requests to the app over localhost.
- **Ollama** is advisory; output never reaches disk or email without CS approval.
- **File Agent** is the only process that writes to backup/production shares; it only runs jobs the app authorised.
- **File Agent service identity** is `.\CS_FileAgent` (or an approved dedicated domain
  equivalent). It must have R/W on both pilot UNC roots and `D:\cs-staging`, plus `Log on as a
service`. It must never run as LocalSystem because LocalSystem does not carry the intended SMB
  share identity. `TUDB01\Designer-TUUO` is permitted only as the explicitly approved interim
  identity until IT provisions the dedicated account.

## Package layout

```text
apps/web          Next.js CS app and API
apps/file-agent   Windows worker (not in Phase 0)
packages/db       Prisma schema and client
packages/shared   Zod, HMAC, password hashing, later path/state machines
n8n/workflows     Exported Gmail poll/send workflows
docs/             Specs, ADRs, risks, status, superpowers plans
```

## Phase 3 Gmail transport

Machine routes are HMAC only; a session cookie never authorises them:

- `POST /api/ingest/email` — idempotent on Gmail message id
- `GET /api/outbound/pending` — approved outbound drafts ready to send
- `POST /api/outbound/:id/sent` — mark sent after n8n delivery

The poll workflow normalises Gmail metadata and posts raw text plus attachment inventory; it does
not store attachment binaries. The send workflow reads only human-approved rows, preserves
`gmailThreadId`, and records the provider message id after delivery. Both exports are inactive and
contain no credentials. Import and activation instructions are in `docs/integrations/n8n-gmail.md`.

## Path policy

UNC only. Never `X:` or `Z:` in config or code. Staging on `D:\cs-staging`.

The Phase 2 copy strategy is robocopy followed by full manifest verification. Public Dropbox and
operator-confirmed manual-drop sources are enabled. Authenticated Google Drive sources are a
permanent failure directing the operator to manual drop until credentials are deliberately
provisioned.

Node filesystem operations use extended-length UNC paths. ADR 0006 documents the one compatibility
boundary: the deployed robocopy rejects `\\?\UNC\...`, so its validated arguments are normal UNC
with native long-path behavior enabled, followed by mandatory SHA-256 verification.
