import { signRequest } from "@cs/shared";
import { z } from "zod";

const artifactSchema = z.object({
  relativePath: z.string().min(1),
  sizeBytes: z.number().int().positive().safe(),
  sha256: z.string().regex(/^[0-9a-f]{64}$/u),
  stage: z.enum(["STAGED", "BACKUP", "PRODUCTION"]),
});

const agentJobSchema = z.object({
  id: z.uuid(),
  kind: z.enum([
    "DOWNLOAD",
    "STAGE_VERIFY",
    "WRITE_BACKUP",
    "COPY_PRODUCTION",
    "VERIFY_PRODUCTION",
  ]),
  attempts: z.number().int().positive(),
  maxAttempts: z.number().int().positive(),
  leaseOwner: z.string(),
  leaseExpiresAt: z.iso.datetime(),
  bytesTotal: z.number().int().nonnegative().safe(),
  bytesDone: z.number().int().nonnegative().safe(),
  correlationId: z.uuid(),
  batch: z.object({
    id: z.uuid(),
    sequence: z.number().int().positive(),
    kind: z.enum(["INITIAL", "ADDITIONAL", "SAMPLE", "CORRECTION"]),
    status: z.enum([
      "PENDING",
      "DOWNLOADING",
      "STAGED",
      "WRITTEN_BACKUP",
      "COPIED_PRODUCTION",
      "VERIFIED",
      "FAILED",
      "CANCELLED",
    ]),
    subfolder: z.string().min(1),
    manualDropConfirmed: z.boolean(),
    sourceLinks: z.array(
      z.object({
        id: z.uuid(),
        kind: z.enum(["DROPBOX", "GDRIVE", "ATTACHMENT", "MANUAL_DROP", "OTHER"]),
        url: z.string().nullable(),
        localHint: z.string().nullable(),
      }),
    ),
    artifacts: z.array(artifactSchema),
    order: z.object({
      id: z.uuid(),
      code: z.string().min(1),
      folderName: z.string().min(1),
      backupPath: z.string().min(1),
      productionPath: z.string().min(1),
      createdAtUtc: z.iso.datetime(),
      client: z.object({
        code: z.string().min(1),
        folderName: z.string().min(1),
      }),
    }),
  }),
});

const leaseResponseSchema = z.object({ job: agentJobSchema.nullable() });
const statusResponseSchema = z.object({
  job: z.object({ id: z.uuid(), status: z.string() }),
});

export type AgentJob = z.infer<typeof agentJobSchema>;
export type AgentArtifact = z.infer<typeof artifactSchema>;

export class AgentApiError extends Error {
  readonly status: number;

  constructor(status: number, operation: string) {
    super(`File Agent API ${operation} failed with HTTP ${status}`);
    this.name = "AgentApiError";
    this.status = status;
  }
}

export class AgentApiClient {
  private readonly baseUrl: string;
  private readonly secret: string;
  private readonly leaseOwner: string;
  private readonly fetcher: typeof fetch;

  constructor(input: {
    baseUrl: string;
    secret: string;
    leaseOwner: string;
    fetcher?: typeof fetch;
  }) {
    this.baseUrl = input.baseUrl.replace(/\/$/u, "");
    this.secret = input.secret;
    this.leaseOwner = input.leaseOwner;
    this.fetcher = input.fetcher ?? fetch;
  }

  private async post<T extends z.ZodType>(
    path: string,
    value: unknown,
    operation: string,
    schema: T,
  ): Promise<z.infer<T>> {
    const body = JSON.stringify(value);
    const timestamp = String(Math.floor(Date.now() / 1_000));
    const signature = signRequest({ secret: this.secret, timestamp, body });
    const response = await this.fetcher(`${this.baseUrl}${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-cs-timestamp": timestamp,
        "x-cs-signature": signature,
      },
      body,
    });
    if (!response.ok) {
      throw new AgentApiError(response.status, operation);
    }
    return schema.parse(await response.json());
  }

  async lease(): Promise<AgentJob | null> {
    const response = await this.post(
      "/api/agent/jobs/lease",
      { leaseOwner: this.leaseOwner },
      "lease",
      leaseResponseSchema,
    );
    return response.job;
  }

  async progress(
    jobId: string,
    attempt: number,
    bytesDone: number,
    bytesTotal: number,
  ): Promise<void> {
    await this.post(
      `/api/agent/jobs/${jobId}/progress`,
      { leaseOwner: this.leaseOwner, attempt, bytesDone, bytesTotal },
      "progress",
      z.object({ job: z.object({ id: z.uuid() }).passthrough() }),
    );
  }

  async complete(
    jobId: string,
    attempt: number,
    artifacts: readonly AgentArtifact[],
  ): Promise<void> {
    await this.post(
      `/api/agent/jobs/${jobId}/complete`,
      { leaseOwner: this.leaseOwner, attempt, artifacts },
      "complete",
      statusResponseSchema,
    );
  }

  async fail(
    jobId: string,
    attempt: number,
    errorClass: "TRANSIENT" | "PERMANENT",
    error: string,
  ): Promise<void> {
    await this.post(
      `/api/agent/jobs/${jobId}/fail`,
      { leaseOwner: this.leaseOwner, attempt, errorClass, error },
      "fail",
      statusResponseSchema,
    );
  }
}
