import { randomUUID } from "node:crypto";
import process from "node:process";
import { prisma } from "@cs/db";
import { resetDatabase } from "@cs/db/testing";
import { joinUncPath } from "@cs/shared";

const E2E_CLIENT_CODE = "P2E2E";

function requireTestDatabase() {
  if (!process.env.DATABASE_URL?.includes("_test")) {
    throw new Error("Phase 2 E2E helper refuses to run outside a _test database");
  }
}

function requiredEnvironment(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

async function setup() {
  requireTestDatabase();
  const backupRoot = requiredEnvironment("BACKUP_ROOT_UNC");
  const productionRoot = requiredEnvironment("PRODUCTION_ROOT_UNC");
  const stagingRoot = requiredEnvironment("STAGING_ROOT");
  if (!backupRoot.endsWith("\\_Software Test") || !productionRoot.endsWith("\\_Software Test")) {
    throw new Error("Phase 2 E2E helper is restricted to the approved _Software Test roots");
  }

  await resetDatabase(prisma);
  const correlationId = randomUUID();
  const actorUserId = randomUUID();
  const client = await prisma.client.create({
    data: {
      code: E2E_CLIENT_CODE,
      displayName: "Phase 2 E2E Verification",
      folderName: "_PHASE2_E2E_20260726",
    },
  });
  const code = "P2E2E_260726_001";
  const folderName = `${code}__live_multi_gigabyte`;
  const order = await prisma.order.create({
    data: {
      code,
      clientId: client.id,
      title: "Live Multi-Gigabyte Phase 2 Verification",
      orderType: "Phase 2 E2E",
      folderName,
      backupPath: joinUncPath(backupRoot, client.folderName, folderName),
      productionPath: joinUncPath(productionRoot, client.folderName, folderName),
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
      manualDropConfirmedAt: new Date(),
      manualDropConfirmedById: actorUserId,
      sourceLinks: {
        create: {
          kind: "MANUAL_DROP",
          localHint: `${stagingRoot}\\manual\\pending`,
          addedById: actorUserId,
        },
      },
    },
  });
  await prisma.sourceLink.updateMany({
    where: { batchId: batch.id, kind: "MANUAL_DROP" },
    data: { localHint: `${stagingRoot}\\manual\\${batch.id}` },
  });
  await prisma.transferJob.create({
    data: {
      batchId: batch.id,
      kind: "DOWNLOAD",
      correlationId,
    },
  });
  process.stdout.write(
    `${JSON.stringify({
      batchId: batch.id,
      orderId: order.id,
      correlationId,
      manualDropPath: `${stagingRoot}\\manual\\${batch.id}`,
      backupPath: order.backupPath,
      productionPath: order.productionPath,
    })}\n`,
  );
}

async function status() {
  requireTestDatabase();
  const order = await prisma.order.findFirst({
    where: { client: { code: E2E_CLIENT_CODE } },
    include: {
      batches: {
        include: {
          transferJobs: { orderBy: { createdAt: "asc" } },
          fileArtifacts: { orderBy: [{ stage: "asc" }, { relativePath: "asc" }] },
        },
      },
      events: { orderBy: { occurredAt: "asc" } },
    },
  });
  if (!order) {
    process.stdout.write(`${JSON.stringify({ order: null })}\n`);
    return;
  }
  const batch = order.batches[0];
  if (!batch) throw new Error("E2E order has no batch");
  process.stdout.write(
    `${JSON.stringify({
      order: { id: order.id, code: order.code },
      batch: { id: batch.id, status: batch.status, failureReason: batch.failureReason },
      jobs: batch.transferJobs.map((job) => ({
        id: job.id,
        kind: job.kind,
        status: job.status,
        attempts: job.attempts,
        bytesDone: Number(job.bytesDone),
        bytesTotal: Number(job.bytesTotal),
        leaseOwner: job.leaseOwner,
        leaseExpiresAt: job.leaseExpiresAt?.toISOString() ?? null,
        errorClass: job.errorClass,
        lastError: job.lastError,
        createdAt: job.createdAt.toISOString(),
        updatedAt: job.updatedAt.toISOString(),
      })),
      artifacts: batch.fileArtifacts.map((artifact) => ({
        relativePath: artifact.relativePath,
        sizeBytes: Number(artifact.sizeBytes),
        sha256: artifact.sha256,
        stage: artifact.stage,
      })),
      events: order.events.map((event) => ({
        type: event.type,
        occurredAt: event.occurredAt.toISOString(),
      })),
    })}\n`,
  );
}

async function cleanup() {
  requireTestDatabase();
  await resetDatabase(prisma);
  process.stdout.write(`${JSON.stringify({ databaseReset: true })}\n`);
}

async function retry() {
  requireTestDatabase();
  const order = await prisma.order.findFirst({
    where: { client: { code: E2E_CLIENT_CODE } },
    include: { batches: true },
  });
  const batch = order?.batches[0];
  if (!batch || batch.status !== "FAILED") {
    throw new Error("E2E batch is not in FAILED status");
  }
  await prisma.$transaction(async (transaction) => {
    await transaction.orderBatch.update({
      where: { id: batch.id },
      data: { status: "PENDING", failureReason: null },
    });
    await transaction.transferJob.upsert({
      where: { batchId_kind: { batchId: batch.id, kind: "DOWNLOAD" } },
      create: {
        batchId: batch.id,
        kind: "DOWNLOAD",
        correlationId: randomUUID(),
      },
      update: {
        status: "QUEUED",
        attempts: 0,
        leaseOwner: null,
        leaseExpiresAt: null,
        lastError: null,
        errorClass: null,
        bytesDone: 0,
        bytesTotal: 0,
        correlationId: randomUUID(),
      },
    });
  });
  process.stdout.write(`${JSON.stringify({ retried: true, batchId: batch.id })}\n`);
}

const command = process.argv[2];
try {
  if (command === "setup") {
    await setup();
  } else if (command === "status") {
    await status();
  } else if (command === "cleanup") {
    await cleanup();
  } else if (command === "retry") {
    await retry();
  } else {
    throw new Error("Usage: node scripts/phase2-e2e.mjs <setup|status|retry|cleanup>");
  }
} finally {
  await prisma.$disconnect();
}
