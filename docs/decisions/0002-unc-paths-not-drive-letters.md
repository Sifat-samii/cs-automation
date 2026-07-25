# ADR 0002: UNC paths, not drive letters

## Context

Backup and production shares are mapped as `X:` and `Z:` on interactive sessions. A Windows service running as LocalSystem (or without the same user profile) cannot resolve those mapped drive letters, so code that works when tested manually can fail in production with "path not found".

## Decision

All path configuration uses UNC paths only. Mapped drive letters (`X:`, `Z:`) are forbidden in code and environment validation. Both the web-related services and the File Agent run under an account with share permissions to `\\192.168.0.15\Production`.

MVP roots:

- Backup: `\\192.168.0.15\Production\File Transfer Server\Sifat_Project Coordinator\Software test\_Software Test`
- Production: `\\192.168.0.15\Production\File Server\_Share Work\2026\_Software Test`

## Alternatives considered

- Continue using `X:` / `Z:` — rejected: invisible to services.
- Map drives inside the service startup script — rejected: fragile, session-dependent, hard to audit.

## Consequences

- A UNC-capable service account must be provisioned before Phase 2 (File Agent).
- Environment validation rejects drive-letter roots at startup.
- Migrating to a new backup server is a config change plus a one-time copy.

## Status

Accepted

## Date

2026-07-26
