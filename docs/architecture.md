# Architecture

## Deployment

Everything for the MVP runs on one on-prem Windows box (`TUDB01`):

| Process | Role |
|---------|------|
| Next.js app (`apps/web`) | CS UI, APIs, approvals, job enqueue |
| PostgreSQL 18 | Source of truth |
| n8n (npm, Windows service) | Gmail poll/send, later Sheets mirror |
| Ollama | Local advisory extraction only |
| File Agent (`apps/file-agent`) | Downloads, staging, UNC writes — Phase 2 |

No Docker in Phase 0 (Docker is not installed on the box).

## Trust boundaries

- **Postgres** owns business state.
- **n8n** is transport only; HMAC-signed requests to the app over localhost.
- **Ollama** is advisory; output never reaches disk or email without CS approval.
- **File Agent** is the only process that writes to backup/production shares; it only runs jobs the app authorised.

## Package layout

```text
apps/web          Next.js CS app and API
apps/file-agent   Windows worker (not in Phase 0)
packages/db       Prisma schema and client
packages/shared   Zod, HMAC, password hashing, later path/state machines
n8n/workflows     Exported workflows (later)
docs/             Specs, ADRs, risks, status
```

## Path policy

UNC only. Never `X:` or `Z:` in config or code. Staging on `D:\cs-staging`.
