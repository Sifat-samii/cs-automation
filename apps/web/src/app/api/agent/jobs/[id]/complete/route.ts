import { prisma } from "@cs/db";
import { z } from "zod";
import { authenticateAgentRequest, parseAgentJson } from "@/lib/agent/http";
import { completeJob, JobLeaseError } from "@/lib/agent/jobs";

const requestSchema = z.object({
  leaseOwner: z.string().trim().min(1).max(200),
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

  try {
    const job = await completeJob(prisma, { jobId: id, ...parsed.data });
    return Response.json({ job: { id: job.id, status: job.status } });
  } catch (error) {
    if (error instanceof JobLeaseError) {
      return Response.json({ error: error.message }, { status: 409 });
    }
    throw error;
  }
}
