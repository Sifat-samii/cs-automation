import { describe, expect, it, vi } from "vitest";
import { assertNoUnsafeCommitments } from "@/lib/ai/guards";
import { classifyDeterministic, classificationSchema } from "@/lib/ai/index";
import * as client from "@/lib/ai/client";
import { classifyInboundEmail } from "@/lib/ai/index";

describe("AI guards", () => {
  it("rejects invented dates when no ETA fact is supplied", () => {
    expect(() =>
      assertNoUnsafeCommitments("We will deliver by 2026-08-01.", { eta: null }),
    ).toThrow(/date/i);
  });

  it("allows dates when ETA is provided", () => {
    expect(() =>
      assertNoUnsafeCommitments("We will deliver by 2026-08-01.", {
        eta: "2026-08-01T00:00:00.000Z",
      }),
    ).not.toThrow();
  });

  it("rejects banned commitment phrases", () => {
    expect(() => assertNoUnsafeCommitments("We guarantee free of charge work.", {})).toThrow(
      /banned/i,
    );
  });
});

describe("classification", () => {
  it("deterministic stub marks known client with links as ORDER", () => {
    expect(classifyDeterministic({ hasLinks: true, clientKnown: true }).intent).toBe("ORDER");
  });

  it("never returns ORDER from live classify when links are missing", async () => {
    vi.spyOn(client, "callOllama").mockResolvedValue(
      classificationSchema.parse({
        intent: "ORDER",
        confidence: 0.9,
        title: "x",
        orderType: "Email intake",
        quantity: null,
        rationale: "model overreach",
      }),
    );
    const result = await classifyInboundEmail(
      {
        subject: "hi",
        bodyText: "just chatting",
        hasLinks: false,
        clientKnown: true,
      },
      {
        enabled: true,
        baseUrl: "http://127.0.0.1:11434",
        model: "qwen3:8b",
        timeoutMs: 1000,
      },
    );
    expect(result?.intent).toBe("CONVERSATION");
    vi.restoreAllMocks();
  });

  it("returns null when Ollama fails", async () => {
    vi.spyOn(client, "callOllama").mockRejectedValue(new client.OllamaError("boom"));
    const result = await classifyInboundEmail(
      {
        subject: "order",
        bodyText: "https://www.dropbox.com/s/a/b.zip",
        hasLinks: true,
        clientKnown: true,
      },
      {
        enabled: true,
        baseUrl: "http://127.0.0.1:11434",
        model: "qwen3:8b",
        timeoutMs: 1000,
      },
    );
    expect(result).toBeNull();
    vi.restoreAllMocks();
  });
});
