import { prisma } from "@cs/db";
import { z } from "zod";
import { authenticateAgentRequest, parseAgentJson } from "@/lib/agent/http";
import { JobLeaseError } from "@/lib/agent/jobs";
import { completePipelineJob } from "@/lib/agent/pipeline";

const requestSchema = z.object({
  leaseOwner: z.string().trim().min(1).max(200),
  attempt: z.number().int().positive(),
  artifacts: z
    .array(
      z.object({
        relativePath: z
          .string()
          .trim()
          .min(1)
          .max(2_000)
          .refine(
            (value) =>
              !value.startsWith("/") &&
              !value.startsWith("\\") &&
              !value.split(/[\\/]/u).some((part) => part === "." || part === ".."),
          ),
        sizeBytes: z.number().int().positive().safe(),
        sha256: z.string().regex(/^[0-9a-f]{64}$/u),
        stage: z.enum(["STAGED", "BACKUP", "PRODUCTION"]),
      }),
    )
    .max(100_000)
    .default([]),
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
    const result = await completePipelineJob(prisma, { jobId: id, ...parsed.data });
    return Response.json({ job: { id: result.jobId, status: "SUCCEEDED" }, pipeline: result });
  } catch (error) {
    if (error instanceof JobLeaseError) {
      return Response.json({ error: error.message }, { status: 409 });
    }
    throw error;
  }
}
