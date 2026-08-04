/**
 * Phase 4 Ollama bake-off harness.
 * Reads labelled JSONL, classifies with qwen3:4b and qwen3:8b, writes a markdown summary.
 *
 * Usage: npx tsx scripts/ai-bakeoff.ts
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

type LabelRow = {
  id: string;
  subject: string;
  bodyText: string;
  hasLinks: boolean;
  clientKnown: boolean;
  expectedIntent: "ORDER" | "CONVERSATION";
};

type ModelResult = {
  model: string;
  accuracy: number;
  medianMs: number;
  n: number;
};

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const fixturePath = join(root, "scripts/fixtures/phase4-email-labels.jsonl");
const outPath = join(root, "docs/benchmarks/2026-07-27-phase4-model-bakeoff.md");
const baseUrl = (process.env.OLLAMA_BASE_URL ?? "http://127.0.0.1:11434").replace(/\/$/u, "");

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2
    : (sorted[mid] ?? 0);
}

async function classify(
  model: string,
  row: LabelRow,
): Promise<{ intent: string | null; ms: number }> {
  const started = Date.now();
  try {
    const response = await fetch(`${baseUrl}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      signal: AbortSignal.timeout(90_000),
      body: JSON.stringify({
        model,
        stream: false,
        format: "json",
        messages: [
          {
            role: "system",
            content:
              'Classify inbound CS email. Return JSON {"intent":"ORDER"|"CONVERSATION","confidence":0-1,"title":null,"orderType":null,"quantity":null,"rationale":"..."}. ORDER requires file links.',
          },
          {
            role: "user",
            content: JSON.stringify({
              subject: row.subject,
              bodyText: row.bodyText,
              hasFileLinks: row.hasLinks,
              clientKnown: row.clientKnown,
            }),
          },
        ],
      }),
    });
    if (!response.ok) return { intent: null, ms: Date.now() - started };
    const payload = (await response.json()) as { message?: { content?: string } };
    const content = payload.message?.content ?? "";
    const parsed = JSON.parse(content) as { intent?: string };
    let intent = parsed.intent ?? null;
    if (intent === "ORDER" && !row.hasLinks) intent = "CONVERSATION";
    return { intent, ms: Date.now() - started };
  } catch {
    return { intent: null, ms: Date.now() - started };
  }
}

async function evaluate(model: string, rows: LabelRow[]): Promise<ModelResult> {
  let correct = 0;
  const latencies: number[] = [];
  for (const row of rows) {
    const result = await classify(model, row);
    latencies.push(result.ms);
    if (result.intent === row.expectedIntent) correct += 1;
  }
  return {
    model,
    accuracy: rows.length === 0 ? 0 : correct / rows.length,
    medianMs: median(latencies),
    n: rows.length,
  };
}

async function main(): Promise<void> {
  const rows = readFileSync(fixturePath, "utf8")
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as LabelRow);

  const models = ["qwen3:4b", "qwen3:8b"];
  const results: ModelResult[] = [];
  for (const model of models) {
    results.push(await evaluate(model, rows));
  }

  const lines = [
    "# Phase 4 model bake-off",
    "",
    `**Date:** ${new Date().toISOString().slice(0, 10)}`,
    `**Corpus size:** ${rows.length}`,
    "",
    "| Model | Intent accuracy | Median latency (ms) | N |",
    "| --- | --- | --- | --- |",
    ...results.map(
      (result) =>
        `| ${result.model} | ${(result.accuracy * 100).toFixed(1)}% | ${result.medianMs.toFixed(0)} | ${result.n} |`,
    ),
    "",
    "Default remains `qwen3:8b` until a labelled corpus of at least fifty real emails is evaluated.",
    "",
  ];
  writeFileSync(outPath, lines.join("\n"), "utf8");
  console.warn(`Wrote ${outPath}`);
  for (const result of results) {
    console.warn(
      `${result.model}: accuracy=${(result.accuracy * 100).toFixed(1)}% medianMs=${result.medianMs.toFixed(0)}`,
    );
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
