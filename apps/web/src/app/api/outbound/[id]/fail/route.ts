import { prisma } from "@cs/db";
import { z } from "zod";
import { authenticateAgentRequest, parseAgentJson } from "@/lib/agent/http";
import { OutboundStateError, requeueOutboundAfterTransportFailure } from "@/lib/outbound/service";

const requestSchema = z.object({
  error: z.string().trim().min(1).max(2_000),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const authenticated = await authenticateAgentRequest(request);
  if (!authenticated.ok) return authenticated.response;
  const parsed = parseAgentJson(requestSchema, authenticated.body);
  if (!parsed.ok) return parsed.response;
  const { id } = await context.params;
  if (!z.uuid().safeParse(id).success) {
    return Response.json({ error: "Outbound email id is invalid" }, { status: 400 });
  }

  try {
    const outbound = await requeueOutboundAfterTransportFailure(prisma, {
      outboundEmailId: id,
      error: parsed.data.error,
    });
    return Response.json({
      outbound: {
        id: outbound.id,
        status: outbound.status,
        lastError: outbound.lastError,
      },
    });
  } catch (error) {
    if (error instanceof OutboundStateError) {
      return Response.json({ error: error.message }, { status: 409 });
    }
    throw error;
  }
}
