import { prisma } from "@cs/db";
import { resetDatabase } from "@cs/db/testing";
import { signRequest } from "@cs/shared";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { POST as completeRoute } from "@/app/api/agent/jobs/[id]/complete/route";
import { POST as failRoute } from "@/app/api/agent/jobs/[id]/fail/route";
import { POST as progressRoute } from "@/app/api/agent/jobs/[id]/progress/route";
import { POST as leaseRoute } from "@/app/api/agent/jobs/lease/route";
import { AGENT_SIGNATURE_HEADER, AGENT_TIMESTAMP_HEADER } from "@/lib/agent/http";

const actorUserId = "11111111-1111-4111-8111-111111111111";
const correlationId = "22222222-2222-4222-8222-222222222222";
const secret = "0123456789abcdef0123456789abcdef";

async function createQueuedJob() {
  const client = await prisma.client.create({
    data: { code: "VRLY", displayName: "Verily", folderName: "Verily" },
  });
  const order = await prisma.order.create({
    data: {
      code: "VRLY_260726_001",
      clientId: client.id,
      title: "Spring Drop",
      orderType: "Standard",
      folderName: "VRLY_260726_001__spring_drop",
      backupPath: "\\\\server\\backup\\Verily\\VRLY_260726_001__spring_drop",
      productionPath: "\\\\server\\production\\Verily\\VRLY_260726_001__spring_drop",
      createdById: actorUserId,
    },
  });
  const batch = await prisma.orderBatch.create({
    data: {
      orderId: order.id,
      sequence: 1,
      kind: "INITIAL",
      subfolder: "01_INITIAL",
      createdById: actorUserId,
      sourceLinks: {
        create: {
          kind: "DROPBOX",
          url: "https://www.dropbox.com/s/example/files.zip?dl=0",
          addedById: actorUserId,
        },
      },
    },
  });
  return prisma.transferJob.create({
    data: { batchId: batch.id, kind: "DOWNLOAD", correlationId },
  });
}

function signedRequest(url: string, value: unknown, timestamp?: string): Request {
  const body = JSON.stringify(value);
  const sentAt = timestamp ?? String(Math.floor(Date.now() / 1_000));
  return new Request(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      [AGENT_TIMESTAMP_HEADER]: sentAt,
      [AGENT_SIGNATURE_HEADER]: signRequest({ secret, timestamp: sentAt, body }),
    },
    body,
  });
}

const params = (id: string) => ({ params: Promise.resolve({ id }) });

describe("HMAC-signed agent job API", () => {
  beforeEach(async () => {
    await resetDatabase(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("leases a job only when the raw body has a valid signature", async () => {
    const queued = await createQueuedJob();
    const response = await leaseRoute(
      signedRequest("http://localhost/api/agent/jobs/lease", { leaseOwner: "file-agent-1" }),
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      job: { id: string; batch: { sourceLinks: Array<{ kind: string }> } };
    };
    expect(body.job.id).toBe(queued.id);
    expect(body.job.batch.sourceLinks).toEqual([expect.objectContaining({ kind: "DROPBOX" })]);
  });

  it("does not accept a valid browser session cookie as agent authority", async () => {
    const queued = await createQueuedJob();
    const response = await leaseRoute(
      new Request("http://localhost/api/agent/jobs/lease", {
        method: "POST",
        headers: { cookie: "cs_session=browser-session" },
        body: JSON.stringify({ leaseOwner: "browser" }),
      }),
    );

    expect(response.status).toBe(401);
    await expect(
      prisma.transferJob.findUniqueOrThrow({ where: { id: queued.id } }),
    ).resolves.toMatchObject({ status: "QUEUED" });
  });

  it("rejects a bad signature", async () => {
    await createQueuedJob();
    const request = signedRequest("http://localhost/api/agent/jobs/lease", {
      leaseOwner: "file-agent-1",
    });
    request.headers.set(AGENT_SIGNATURE_HEADER, "a".repeat(64));

    await expect(leaseRoute(request)).resolves.toMatchObject({ status: 401 });
  });

  it("rejects a replay outside the timestamp tolerance", async () => {
    await createQueuedJob();
    const stale = String(Math.floor(Date.now() / 1_000) - 301);
    const response = await leaseRoute(
      signedRequest("http://localhost/api/agent/jobs/lease", { leaseOwner: "file-agent-1" }, stale),
    );

    expect(response.status).toBe(401);
  });

  it("heartbeats through progress and completes the owned job", async () => {
    const queued = await createQueuedJob();
    await leaseRoute(
      signedRequest("http://localhost/api/agent/jobs/lease", { leaseOwner: "file-agent-1" }),
    );
    const progress = await progressRoute(
      signedRequest(`http://localhost/api/agent/jobs/${queued.id}/progress`, {
        leaseOwner: "file-agent-1",
        bytesDone: 512,
        bytesTotal: 1024,
      }),
      params(queued.id),
    );
    expect(progress.status).toBe(200);

    const complete = await completeRoute(
      signedRequest(`http://localhost/api/agent/jobs/${queued.id}/complete`, {
        leaseOwner: "file-agent-1",
      }),
      params(queued.id),
    );
    expect(complete.status).toBe(200);
    await expect(
      prisma.transferJob.findUniqueOrThrow({ where: { id: queued.id } }),
    ).resolves.toMatchObject({
      status: "SUCCEEDED",
      bytesDone: BigInt(512),
      bytesTotal: BigInt(1024),
    });
  });

  it("records a permanent failure through the signed endpoint", async () => {
    const queued = await createQueuedJob();
    await leaseRoute(
      signedRequest("http://localhost/api/agent/jobs/lease", { leaseOwner: "file-agent-1" }),
    );

    const response = await failRoute(
      signedRequest(`http://localhost/api/agent/jobs/${queued.id}/fail`, {
        leaseOwner: "file-agent-1",
        errorClass: "PERMANENT",
        error: "Manual drop required",
      }),
      params(queued.id),
    );

    expect(response.status).toBe(200);
    await expect(
      prisma.transferJob.findUniqueOrThrow({ where: { id: queued.id } }),
    ).resolves.toMatchObject({
      status: "FAILED",
      errorClass: "PERMANENT",
    });
  });
});
