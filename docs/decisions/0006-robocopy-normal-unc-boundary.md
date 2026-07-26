# ADR 0006: Robocopy receives normal UNC paths at its process boundary

**Status:** Accepted  
**Date:** 2026-07-26

## Context

Phase 2 uses extended-length paths for Node filesystem operations and selected robocopy for the
backup-to-production copy after the hardware benchmark.

The live Phase 2 E2E run proved that the deployed Windows 10 robocopy rejects
`\\?\UNC\server\share\...` arguments. Read-only `/L` diagnostics returned error 123/53 and exit
code 16 for extended UNC arguments. The same source and destination expressed as normal
`\\server\share\...` UNC paths returned robocopy exit code 1, which is a successful
"files would be copied" result.

## Decision

- Node filesystem operations continue to convert UNC paths to `\\?\UNC\...`.
- The robocopy adapter validates that both arguments are UNC paths, converts an extended UNC input
  back to normal UNC only at the robocopy process boundary, and never accepts a drive-letter path.
- `/256` is deliberately omitted so robocopy retains its native long-path behavior.
- Robocopy output is never trusted as verification. The agent performs size and SHA-256 manifest
  verification through the extended-length Node filesystem port before atomic promotion.

## Consequences

Robocopy works on the actual TUDB01/SMB environment while the application's own filesystem access
remains extended-length and UNC-only. The process-boundary exception is explicit, narrow, tested,
and protected by post-copy checksum verification.
