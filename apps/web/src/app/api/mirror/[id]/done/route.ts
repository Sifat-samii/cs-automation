import { prisma } from "@cs/db";
import { z } from "zod";
import { authenticateAgentRequest, parseAgentJson } from "@/lib/agent/http";
import { markMirrorDone, SheetMirrorStateError } from "@/lib/sheets/outbox";

const requestSchema = z.object({
  providerRowKey: z.string().trim().min(1).max(500),
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
    return Response.json({ error: "Mirror outbox id is invalid" }, { status: 400 });
  }

  try {
    const mirror = await markMirrorDone(prisma, {
      id,
      providerRowKey: parsed.data.providerRowKey,
    });
    return Response.json({
      mirror: {
        id: mirror.id,
        status: mirror.status,
        providerRowKey: mirror.providerRowKey,
      },
    });
  } catch (error) {
    if (error instanceof SheetMirrorStateError) {
      return Response.json({ error: error.message }, { status: 409 });
    }
    throw error;
  }
}
