import { prisma } from "@cs/db";
import { authenticateAgentRequest } from "@/lib/agent/http";
import { claimPendingMirror, SheetMirrorStateError } from "@/lib/sheets/outbox";

export async function GET(request: Request): Promise<Response> {
  const authenticated = await authenticateAgentRequest(request);
  if (!authenticated.ok) return authenticated.response;
  const parsedLimit = Number(new URL(request.url).searchParams.get("limit") ?? "50");
  if (!Number.isInteger(parsedLimit) || parsedLimit < 1 || parsedLimit > 100) {
    return Response.json({ error: "limit must be an integer between 1 and 100" }, { status: 400 });
  }
  try {
    const mirror = await claimPendingMirror(prisma, parsedLimit);
    return Response.json({ mirror });
  } catch (error) {
    if (error instanceof SheetMirrorStateError) {
      return Response.json({ error: error.message }, { status: 409 });
    }
    throw error;
  }
}
