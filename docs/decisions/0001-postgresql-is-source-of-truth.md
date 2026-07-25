# ADR 0001: PostgreSQL is the source of truth

## Context

The CS team currently tracks orders in Google Sheets. n8n will handle Gmail and Sheets I/O. Without a clear authority, business state can diverge across tools.

## Decision

PostgreSQL is the only authoritative store for orders, users, audit events, jobs, and email triage state. n8n and Google Sheets hold no authoritative state. Sheets becomes a one-way mirror from Postgres in a later phase.

## Alternatives considered

- Google Sheets as source of truth — rejected: weak concurrency, no transactional integrity, poor fit for job leases and audit.
- n8n workflow data as authority — rejected: not durable or queryable for application workflows.

## Consequences

- All mutations go through the app and Postgres.
- Production staff who today read the sheet will not see app-created orders until the mirror ships; that is a go-live blocker.
- Reconciliation and audit are possible from one database.

## Status

Accepted

## Date

2026-07-26
