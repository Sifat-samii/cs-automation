import { prisma } from "@cs/db";
import { resetDatabase } from "@cs/db/testing";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { leaseNextJob } from "@/lib/agent/jobs";
import {
  completePipelineJob,
  queueBatchTransfer,
  type PipelineArtifactInput,
} from "@/lib/agent/pipeline";

const actorUserId = "11111111-1111-4111-8111-111111111111";
const correlationId = "22222222-2222-4222-8222-222222222222";

async function createBatch(): Promise<string> {
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
  return batch.id;
}

describe("transfer pipeline orchestration", () => {
  beforeEach(async () => {
    await resetDatabase(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("queues and advances all five jobs with manifests and audit history", async () => {
    const batchId = await createBatch();
    await queueBatchTransfer(prisma, { batchId, correlationId });
    const stages = [
      { kind: "DOWNLOAD", batchStatus: "DOWNLOADING", artifacts: [] },
      {
        kind: "STAGE_VERIFY",
        batchStatus: "STAGED",
        artifacts: [
          {
            relativePath: "image.tif",
            sizeBytes: 6,
            sha256: "a".repeat(64),
            stage: "STAGED",
          },
        ],
      },
      {
        kind: "WRITE_BACKUP",
        batchStatus: "WRITTEN_BACKUP",
        artifacts: [
          {
            relativePath: "image.tif",
            sizeBytes: 6,
            sha256: "a".repeat(64),
            stage: "BACKUP",
          },
        ],
      },
      {
        kind: "COPY_PRODUCTION",
        batchStatus: "COPIED_PRODUCTION",
        artifacts: [
          {
            relativePath: "image.tif",
            sizeBytes: 6,
            sha256: "a".repeat(64),
            stage: "PRODUCTION",
          },
        ],
      },
      {
        kind: "VERIFY_PRODUCTION",
        batchStatus: "VERIFIED",
        artifacts: [
          {
            relativePath: "image.tif",
            sizeBytes: 6,
            sha256: "a".repeat(64),
            stage: "PRODUCTION",
          },
        ],
      },
    ] as const;

    for (const stage of stages) {
      const leased = await leaseNextJob(prisma, { leaseOwner: "agent-1" });
      expect(leased?.kind).toBe(stage.kind);
      if (!leased) throw new Error("Expected a queued pipeline job");
      await completePipelineJob(prisma, {
        jobId: leased.id,
        leaseOwner: "agent-1",
        artifacts: stage.artifacts as readonly PipelineArtifactInput[],
      });
      await expect(
        prisma.orderBatch.findUniqueOrThrow({ where: { id: batchId } }),
      ).resolves.toMatchObject({ status: stage.batchStatus });
    }

    await expect(leaseNextJob(prisma, { leaseOwner: "agent-1" })).resolves.toBeNull();
    await expect(
      prisma.transferJob.count({ where: { batchId, status: "SUCCEEDED" } }),
    ).resolves.toBe(5);
    await expect(prisma.fileArtifact.count({ where: { batchId } })).resolves.toBe(3);
    await expect(
      prisma.orderEvent.count({ where: { batchId, type: { startsWith: "transfer." } } }),
    ).resolves.toBe(5);
    await expect(
      prisma.auditEvent.count({ where: { correlationId, actorLabel: "File Agent" } }),
    ).resolves.toBe(5);
  });
});
