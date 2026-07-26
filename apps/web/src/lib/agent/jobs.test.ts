import { prisma } from "@cs/db";
import { resetDatabase } from "@cs/db/testing";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { failJob, heartbeat, leaseNextJob } from "@/lib/agent/jobs";
import { completePipelineJob, failPipelineJob } from "@/lib/agent/pipeline";

const actorUserId = "11111111-1111-4111-8111-111111111111";
const correlationId = "22222222-2222-4222-8222-222222222222";
const now = new Date("2026-07-26T12:00:00.000Z");

async function createQueuedJob(maxAttempts: number = 3) {
  await prisma.user.create({
    data: {
      id: actorUserId,
      loginId: "2061",
      displayName: "Sifat Sami",
      passwordHash: "test-only-password-hash",
      role: "CS_LEAD",
    },
  });
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
    },
  });
  return prisma.transferJob.create({
    data: {
      batchId: batch.id,
      kind: "DOWNLOAD",
      maxAttempts,
      correlationId,
    },
  });
}

describe("leased transfer job queue", () => {
  beforeEach(async () => {
    await resetDatabase(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("allows exactly one concurrent agent to lease one queued job", async () => {
    const job = await createQueuedJob();
    const [first, second] = await Promise.all([
      leaseNextJob(prisma, { leaseOwner: "agent-a", now }),
      leaseNextJob(prisma, { leaseOwner: "agent-b", now }),
    ]);

    expect([first, second].filter(Boolean)).toHaveLength(1);
    expect(first?.id ?? second?.id).toBe(job.id);
    await expect(
      prisma.transferJob.findUniqueOrThrow({ where: { id: job.id } }),
    ).resolves.toMatchObject({
      status: "LEASED",
      attempts: 1,
    });
  });

  it("reclaims an expired lease for another agent", async () => {
    const job = await createQueuedJob();
    await prisma.transferJob.update({
      where: { id: job.id },
      data: {
        status: "LEASED",
        attempts: 1,
        leaseOwner: "dead-agent",
        leaseExpiresAt: new Date(now.getTime() - 1),
      },
    });

    await expect(
      leaseNextJob(prisma, { leaseOwner: "recovery-agent", now }),
    ).resolves.toMatchObject({
      id: job.id,
      leaseOwner: "recovery-agent",
      attempts: 2,
    });
  });

  it("never requeues a permanent failure even when attempts remain", async () => {
    const job = await createQueuedJob(5);
    await leaseNextJob(prisma, { leaseOwner: "agent-a", now });

    await expect(
      failJob(prisma, {
        jobId: job.id,
        leaseOwner: "agent-a",
        attempt: 1,
        now: new Date(now.getTime() + 1),
        errorClass: "PERMANENT",
        error: "Authenticated Google Drive links require manual drop",
      }),
    ).resolves.toMatchObject({
      status: "FAILED",
      attempts: 1,
      errorClass: "PERMANENT",
    });
  });

  it("requeues transient failures until the attempt limit is reached", async () => {
    const job = await createQueuedJob(2);
    await leaseNextJob(prisma, { leaseOwner: "agent-a", now });

    await expect(
      failJob(prisma, {
        jobId: job.id,
        leaseOwner: "agent-a",
        attempt: 1,
        now: new Date(now.getTime() + 1),
        errorClass: "TRANSIENT",
        error: "Temporary network interruption",
      }),
    ).resolves.toMatchObject({ status: "QUEUED", attempts: 1 });

    await leaseNextJob(prisma, {
      leaseOwner: "agent-b",
      now: new Date(now.getTime() + 2),
    });
    await expect(
      failJob(prisma, {
        jobId: job.id,
        leaseOwner: "agent-b",
        attempt: 2,
        now: new Date(now.getTime() + 3),
        errorClass: "TRANSIENT",
        error: "Temporary network interruption",
      }),
    ).resolves.toMatchObject({ status: "FAILED", attempts: 2 });
  });

  it("refuses a heartbeat from a different lease owner", async () => {
    const job = await createQueuedJob();
    await leaseNextJob(prisma, { leaseOwner: "agent-a", now });

    await expect(
      heartbeat(prisma, {
        jobId: job.id,
        leaseOwner: "agent-b",
        attempt: 1,
        now: new Date(now.getTime() + 1),
      }),
    ).rejects.toThrow(/owned by another agent/u);
  });

  it("terminally fails an expired final-attempt lease instead of leaving it stuck", async () => {
    const job = await createQueuedJob(1);
    const leased = await leaseNextJob(prisma, {
      leaseOwner: "dead-agent",
      now,
      leaseDurationMs: 1_000,
    });
    expect(leased).toMatchObject({ id: job.id, attempts: 1 });

    await expect(
      leaseNextJob(prisma, {
        leaseOwner: "recovery-agent",
        now: new Date(now.getTime() + 1_001),
      }),
    ).resolves.toBeNull();
    await expect(
      prisma.transferJob.findUniqueOrThrow({ where: { id: job.id } }),
    ).resolves.toMatchObject({
      status: "FAILED",
      attempts: 1,
      leaseOwner: null,
      errorClass: "TRANSIENT",
    });
    await expect(
      prisma.orderBatch.findUniqueOrThrow({ where: { id: job.batchId } }),
    ).resolves.toMatchObject({
      status: "FAILED",
      failureReason: expect.stringMatching(/final permitted attempt/iu),
    });
    await expect(
      prisma.orderEvent.count({ where: { batchId: job.batchId, type: "transfer.failed" } }),
    ).resolves.toBe(1);
  });

  it("rejects stale completion and failure after the job is reclaimed", async () => {
    const job = await createQueuedJob();
    await leaseNextJob(prisma, {
      leaseOwner: "stable-agent-name",
      now,
      leaseDurationMs: 1_000,
    });
    const reclaimedAt = new Date(now.getTime() + 1_001);
    await leaseNextJob(prisma, {
      leaseOwner: "stable-agent-name",
      now: reclaimedAt,
      leaseDurationMs: 60_000,
    });

    await expect(
      completePipelineJob(prisma, {
        jobId: job.id,
        leaseOwner: "stable-agent-name",
        attempt: 1,
        artifacts: [],
        now: new Date(reclaimedAt.getTime() + 1),
      }),
    ).rejects.toThrow(/lease is missing|expired|owned/iu);
    await expect(
      failPipelineJob(prisma, {
        jobId: job.id,
        leaseOwner: "stable-agent-name",
        attempt: 1,
        errorClass: "TRANSIENT",
        error: "Late result from old attempt",
        now: new Date(reclaimedAt.getTime() + 1),
      }),
    ).rejects.toThrow(/lease is missing|expired|owned/iu);
    await expect(
      prisma.transferJob.findUniqueOrThrow({ where: { id: job.id } }),
    ).resolves.toMatchObject({ status: "LEASED", attempts: 2 });
  });
});
