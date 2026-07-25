# ADR 0004: In-house session authentication

## Context

MVP users are internal CS staff only (CS_EXECUTIVE and CS_LEAD). No external identity provider is required. The app will initially run over plain HTTP on the office LAN.

## Decision

Use argon2id password hashing via `@node-rs/argon2` and opaque 32-byte session tokens stored as SHA-256 hashes in PostgreSQL. Sessions are database-backed with configurable TTL. Role checks are enforced server-side.

## Alternatives considered

- Auth.js v5 — rejected: credentials flow adds substantial beta-churn surface for OAuth features we do not need.
- Lucia — rejected: deprecated.

## Consequences

- We own session rotation, expiry, and invalidation; covered by tests.
- Session cookies initially cannot set `Secure` on plain HTTP; HTTPS is required before broader or untrusted-network use.
- Failed login attempts are audited; login rate limiting is deferred to a later phase alongside ingest.

## Status

Accepted

## Date

2026-07-26
