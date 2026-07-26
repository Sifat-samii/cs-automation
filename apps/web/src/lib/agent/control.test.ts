import { prisma } from "@cs/db";
import { resetDatabase } from "@cs/db/testing";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  confirmManualDropAndRetry,
  retryBatchTransfer,
  startBatchTransfer,
} from "@/lib/agent/control";

const actor = {
  userId: "11111111-1111-4111-8111-111111111111",
  label: "Sifat Sami",
};
const correlationId = "22222222-2222-4222-8222-222222222222";

async function createBatch(): Promise<string> {
  await prisma.user.create({
    data: {
      id: actor.userId,
      loginId: "2061",
      displayName: actor.label,
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
      backupPath: "\\\\server\\backup\\order",
      productionPath: "\\\\server\\production\\order",
      createdById: actor.userId,
    },
  });
  const batch = await prisma.orderBatch.create({
    data: {
      orderId: order.id,
      sequence: 1,
      kind: "INITIAL",
      subfolder: "01_INITIAL",
      createdById: actor.userId,
    },
  });
  return batch.id;
}

describe("operator transfer controls", () => {
  beforeEach(async () => {
    await resetDatabase(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("queues a new pending batch with an event and audit", async () => {
    const batchId = await createBatch();

    await startBatchTransfer(prisma, { batchId, actor, correlationId });

    await expect(
      prisma.transferJob.findUniqueOrThrow({
        where: { batchId_kind: { batchId, kind: "DOWNLOAD" } },
      }),
    ).resolves.toMatchObject({ status: "QUEUED", attempts: 0 });
    await expect(
      prisma.orderEvent.count({ where: { batchId, type: "transfer.queued" } }),
    ).resolves.toBe(1);
    await expect(
      prisma.auditEvent.count({ where: { correlationId, action: "transfer.queued" } }),
    ).resolves.toBe(1);
  });

  it("resets a failed batch and download job for an explicit retry", async () => {
    const batchId = await createBatch();
    await prisma.orderBatch.update({
      where: { id: batchId },
      data: { status: "FAILED", failureReason: "Network exhausted" },
    });
    await prisma.transferJob.create({
      data: {
        batchId,
        kind: "DOWNLOAD",
        status: "FAILED",
        attempts: 3,
        errorClass: "TRANSIENT",
        lastError: "Network exhausted",
        correlationId,
      },
    });

    await retryBatchTransfer(prisma, { batchId, actor, correlationId });

    await expect(
      prisma.orderBatch.findUniqueOrThrow({ where: { id: batchId } }),
    ).resolves.toMatchObject({
      status: "PENDING",
      failureReason: null,
    });
    await expect(
      prisma.transferJob.findUniqueOrThrow({
        where: { batchId_kind: { batchId, kind: "DOWNLOAD" } },
      }),
    ).resolves.toMatchObject({ status: "QUEUED", attempts: 0, errorClass: null });
  });

  it("confirms manual drop only after a permanent download failure", async () => {
    const batchId = await createBatch();
    await prisma.orderBatch.update({ where: { id: batchId }, data: { status: "FAILED" } });
    await prisma.transferJob.create({
      data: {
        batchId,
        kind: "DOWNLOAD",
        status: "FAILED",
        attempts: 1,
        errorClass: "PERMANENT",
        lastError: "Google Drive requires manual drop",
        correlationId,
      },
    });

    await confirmManualDropAndRetry(prisma, {
      batchId,
      actor,
      correlationId,
      stagingRoot: "D:\\cs-staging",
    });

    await expect(
      prisma.orderBatch.findUniqueOrThrow({ where: { id: batchId } }),
    ).resolves.toMatchObject({
      status: "PENDING",
      manualDropConfirmedById: actor.userId,
      manualDropConfirmedAt: expect.any(Date),
    });
    await expect(
      prisma.sourceLink.findFirstOrThrow({ where: { batchId, kind: "MANUAL_DROP" } }),
    ).resolves.toMatchObject({
      localHint: `D:\\cs-staging\\manual\\${batchId}`,
    });
  });
});
