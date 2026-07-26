import { prisma } from "@cs/db";
import { z } from "zod";
import { authenticateAgentRequest, parseAgentJson, serializeAgentJob } from "@/lib/agent/http";
import { leaseNextJob } from "@/lib/agent/jobs";

const requestSchema = z.object({
  leaseOwner: z.string().trim().min(1).max(200),
});

export async function POST(request: Request): Promise<Response> {
  const authenticated = await authenticateAgentRequest(request);
  if (!authenticated.ok) return authenticated.response;
  const parsed = parseAgentJson(requestSchema, authenticated.body);
  if (!parsed.ok) return parsed.response;

  const job = await leaseNextJob(prisma, parsed.data);
  return Response.json({ job: job ? await serializeAgentJob(prisma, job.id) : null });
}
