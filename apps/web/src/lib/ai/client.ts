import { z } from "zod";

export class OllamaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OllamaError";
  }
}

export type CallOllamaOptions<T> = {
  schema: z.ZodType<T>;
  timeoutMs: number;
  baseUrl: string;
  model: string;
  system: string;
  user: string;
  fetchImpl?: typeof fetch;
};

type OllamaChatResponse = {
  message?: { content?: string };
  response?: string;
};

function extractJsonObject(raw: string): unknown {
  const trimmed = raw.trim();
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(trimmed.slice(start, end + 1)) as unknown;
    }
    throw new OllamaError("Ollama response was not valid JSON");
  }
}

export async function callOllama<T>(options: CallOllamaOptions<T>): Promise<T> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const url = `${options.baseUrl.replace(/\/$/u, "")}/api/chat`;

  const runOnce = async (): Promise<T> => {
    const response = await fetchImpl(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      signal: AbortSignal.timeout(options.timeoutMs),
      body: JSON.stringify({
        model: options.model,
        stream: false,
        format: "json",
        messages: [
          { role: "system", content: options.system },
          { role: "user", content: options.user },
        ],
      }),
    });
    if (!response.ok) {
      throw new OllamaError(`Ollama HTTP ${response.status}`);
    }
    const payload = (await response.json()) as OllamaChatResponse;
    const content = payload.message?.content ?? payload.response;
    if (!content || typeof content !== "string") {
      throw new OllamaError("Ollama response missing content");
    }
    const parsed = extractJsonObject(content);
    const validated = options.schema.safeParse(parsed);
    if (!validated.success) {
      throw new OllamaError("Ollama response failed schema validation");
    }
    return validated.data;
  };

  try {
    return await runOnce();
  } catch (error) {
    // Retry once on transport failures only — never on schema/validation failures.
    if (error instanceof OllamaError && error.message.includes("failed schema")) {
      throw error;
    }
    if (error instanceof OllamaError && error.message.includes("not valid JSON")) {
      throw error;
    }
    try {
      return await runOnce();
    } catch (retryError) {
      throw retryError instanceof Error ? retryError : new OllamaError("Ollama request failed");
    }
  }
}
