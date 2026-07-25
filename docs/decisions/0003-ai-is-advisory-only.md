# ADR 0003: AI is advisory only

## Context

Client emails are messy: additional files, samples, corrections, late instructions. A local LLM (`qwen3:8b` via Ollama) is available, but the workstation GPU (GT 1030, 2 GB) cannot host it, so inference is CPU-only at roughly 3-6 tokens/sec. Policy also requires local-only models (no external LLM APIs).

## Decision

Deterministic rules own client resolution, Gmail thread correlation, and Dropbox/Drive link extraction. The model only proposes intent classification and free-text fields. Model output is validated against a Zod schema and treated as untrusted. Every proposal passes through human approval before an order, filesystem write, or outbound email exists. Rule-based proposals appear in the inbox immediately; model refinements apply asynchronously.

## Alternatives considered

- Model as primary extractor — rejected: too slow at volume (20-100 emails/day) and unsafe for critical fields.
- External cloud LLM — rejected: local-only constraint.
- No AI in MVP — deferred assistance is acceptable for early phases; this ADR constrains AI when it lands.

## Consequences

- Inbox UX must not block on inference.
- A bake-off between `qwen3:4b` and `qwen3:8b` is required before choosing a default.
- Confidence scores never replace business rules or approvals.

## Status

Accepted

## Date

2026-07-26
