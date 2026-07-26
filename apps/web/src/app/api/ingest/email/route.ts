import { prisma } from "@cs/db";
import { authenticateAgentRequest, parseAgentJson } from "@/lib/agent/http";
import { checkIngestRateLimit } from "@/lib/ingest/rate-limit";
import { ingestEmail, ingestEmailSchema } from "@/lib/ingest/service";

function callerKey(request: Request): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip")?.trim() ||
    "local-machine"
  );
}

export async function POST(request: Request): Promise<Response> {
  const authenticated = await authenticateAgentRequest(request);
  if (!authenticated.ok) return authenticated.response;

  const limit = checkIngestRateLimit(callerKey(request));
  if (!limit.allowed) {
    return Response.json(
      { error: "Email ingest rate limit exceeded" },
      { status: 429, headers: { "retry-after": String(limit.retryAfterSeconds) } },
    );
  }

  const parsed = parseAgentJson(ingestEmailSchema, authenticated.body);
  if (!parsed.ok) return parsed.response;
  const idempotencyKey = request.headers.get("idempotency-key");
  if (!idempotencyKey || idempotencyKey !== parsed.data.gmailMessageId) {
    return Response.json({ error: "Idempotency-Key must equal gmailMessageId" }, { status: 400 });
  }

  const result = await ingestEmail(prisma, parsed.data);
  return Response.json(result, { status: result.duplicate ? 200 : 201 });
}
