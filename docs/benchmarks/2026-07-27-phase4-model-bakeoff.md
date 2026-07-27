# Phase 4 model bake-off

**Date:** 2026-07-27  
**Status:** Harness shipped; default remains `qwen3:8b` until ≥50 labelled real emails are evaluated.

## How to run

```powershell
$env:OLLAMA_BASE_URL = "http://127.0.0.1:11434"
npx tsx scripts/ai-bakeoff.ts
```

Fixture: `scripts/fixtures/phase4-email-labels.jsonl` (starter samples). Replace with labelled production samples before changing the default model.

## Metrics

| Model    | Intent accuracy | Median latency | Notes        |
| -------- | --------------- | -------------- | ------------ |
| qwen3:4b | TBD             | TBD            | Run bake-off |
| qwen3:8b | TBD (default)   | TBD            | Run bake-off |

## Decision rule

Keep `qwen3:8b` unless `qwen3:4b` matches or beats intent accuracy within 2 percentage points **and** median latency is materially better on the labelled corpus.
