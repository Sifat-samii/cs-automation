import { z } from "zod";
import { callOllama, OllamaError } from "@/lib/ai/client";
import { assertNoUnsafeCommitments } from "@/lib/ai/guards";
import {
  buildClassifyUserPrompt,
  buildDraftUserPrompt,
  CS_AI_SYSTEM_PROMPT,
} from "@/lib/ai/prompts";

export const classificationSchema = z.object({
  intent: z.enum(["ORDER", "CONVERSATION"]),
  confidence: z.number().min(0).max(1),
  title: z.string().trim().min(1).max(500).nullable(),
  orderType: z.string().trim().min(1).max(200).nullable(),
  quantity: z.number().int().positive().nullable(),
  rationale: z.string().trim().min(1).max(1000),
});

export type ClassificationResult = z.infer<typeof classificationSchema>;

export const draftSchema = z.object({
  subject: z.string().trim().min(1).max(500),
  body: z.string().trim().min(1).max(20_000),
});

export type DraftResult = z.infer<typeof draftSchema>;

export type AiRuntimeConfig = {
  enabled: boolean;
  baseUrl: string;
  model: string;
  timeoutMs: number;
};

export function aiConfigFromEnv(env: {
  AI_ENABLED: boolean;
  OLLAMA_BASE_URL: string;
  OLLAMA_MODEL: string;
  AI_TIMEOUT_MS: number;
}): AiRuntimeConfig {
  return {
    enabled: env.AI_ENABLED,
    baseUrl: env.OLLAMA_BASE_URL,
    model: env.OLLAMA_MODEL,
    timeoutMs: env.AI_TIMEOUT_MS,
  };
}

export async function classifyInboundEmail(
  input: {
    subject: string;
    bodyText: string;
    hasLinks: boolean;
    clientKnown: boolean;
  },
  config: AiRuntimeConfig,
): Promise<ClassificationResult | null> {
  if (!config.enabled) return null;
  // Without links, never return ORDER even if the model says so.
  try {
    const result = await callOllama({
      schema: classificationSchema,
      timeoutMs: config.timeoutMs,
      baseUrl: config.baseUrl,
      model: config.model,
      system: CS_AI_SYSTEM_PROMPT,
      user: buildClassifyUserPrompt(input),
    });
    if (result.intent === "ORDER" && !input.hasLinks) {
      return {
        ...result,
        intent: "CONVERSATION",
        rationale: `${result.rationale} (no file links)`,
      };
    }
    return result;
  } catch (error) {
    if (error instanceof OllamaError || error instanceof Error) {
      return null;
    }
    return null;
  }
}

async function draftWithGuard(
  kind: "conversation" | "query" | "confirmation" | "eta_update",
  facts: Record<string, unknown>,
  config: AiRuntimeConfig,
): Promise<DraftResult | null> {
  if (!config.enabled) return null;
  try {
    const draft = await callOllama({
      schema: draftSchema,
      timeoutMs: config.timeoutMs,
      baseUrl: config.baseUrl,
      model: config.model,
      system: CS_AI_SYSTEM_PROMPT,
      user: buildDraftUserPrompt({ kind, facts }),
    });
    assertNoUnsafeCommitments(draft.body, {
      eta: typeof facts.eta === "string" ? facts.eta : null,
    });
    return draft;
  } catch {
    return null;
  }
}

export function draftConversationReply(
  facts: Record<string, unknown>,
  config: AiRuntimeConfig,
): Promise<DraftResult | null> {
  return draftWithGuard("conversation", facts, config);
}

export function draftQueryReply(
  facts: Record<string, unknown>,
  config: AiRuntimeConfig,
): Promise<DraftResult | null> {
  return draftWithGuard("query", facts, config);
}

export function draftOrderConfirmation(
  facts: Record<string, unknown>,
  config: AiRuntimeConfig,
): Promise<DraftResult | null> {
  return draftWithGuard("confirmation", facts, config);
}

export function draftEtaUpdate(
  facts: Record<string, unknown>,
  config: AiRuntimeConfig,
): Promise<DraftResult | null> {
  return draftWithGuard("eta_update", facts, config);
}

/** Deterministic classify stub used when AI is disabled or for tests. */
export function classifyDeterministic(input: {
  hasLinks: boolean;
  clientKnown: boolean;
}): ClassificationResult {
  if (input.clientKnown && input.hasLinks) {
    return {
      intent: "ORDER",
      confidence: 0.7,
      title: null,
      orderType: "Email intake",
      quantity: null,
      rationale: "Deterministic stub: known client with file links",
    };
  }
  return {
    intent: "CONVERSATION",
    confidence: 0.7,
    title: null,
    orderType: null,
    quantity: null,
    rationale: "Deterministic stub: conversation or incomplete order signals",
  };
}

export const AiOrchestrator = {
  classifyInboundEmail,
  classifyDeterministic,
  draftConversationReply,
  draftQueryReply,
  draftOrderConfirmation,
  draftEtaUpdate,
  aiConfigFromEnv,
};
