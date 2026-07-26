import { prisma } from "@cs/db";
import { z } from "zod";
import { authenticateAgentRequest, parseAgentJson } from "@/lib/agent/http";
import { JobLeaseError, updateJobProgress } from "@/lib/agent/jobs";

const requestSchema = z.object({
  leaseOwner: z.string().trim().min(1).max(200),
  attempt: z.number().int().positive(),
  bytesDone: z.number().int().nonnegative().safe(),
  bytesTotal: z.number().int().nonnegative().safe(),
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
    const job = await updateJobProgress(prisma, { jobId: id, ...parsed.data });
    return Response.json({
      job: {
        id: job.id,
        bytesDone: Number(job.bytesDone),
        bytesTotal: Number(job.bytesTotal),
        leaseExpiresAt: job.leaseExpiresAt?.toISOString() ?? null,
      },
    });
  } catch (error) {
    if (error instanceof JobLeaseError) {
      return Response.json({ error: error.message }, { status: 409 });
    }
    throw error;
  }
}
