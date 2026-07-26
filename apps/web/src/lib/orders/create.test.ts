import { prisma } from "@cs/db";
import { resetDatabase } from "@cs/db/testing";
import { PathBudgetError, parseServerEnv } from "@cs/shared";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createOrder } from "@/lib/orders/create";

const actor = {
  userId: "11111111-1111-4111-8111-111111111111",
  label: "Sifat Sami",
};
const correlationId = "22222222-2222-4222-8222-222222222222";
const createdAt = new Date("2026-07-26T12:00:00.000Z");
const env = parseServerEnv(process.env);

async function createFixtures(): Promise<{ clientId: string }> {
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
    data: {
      code: "VRLY",
      displayName: "Verily",
      folderName: "Verily",
    },
  });
  return { clientId: client.id };
}

function orderInput(clientId: string, title: string = "Kirkland Spring Drop") {
  return {
    clientId,
    title,
    orderType: "Retouching",
    quantity: 24,
    sourceLinks: [
      { kind: "DROPBOX" as const, url: "https://example.com/source" },
      { kind: "MANUAL_DROP" as const, localHint: "Files supplied separately" },
    ],
    actor,
    correlationId,
    createdAt,
    backupRoot: env.BACKUP_ROOT_UNC,
    productionRoot: env.PRODUCTION_ROOT_UNC,
  };
}

describe("createOrder", () => {
  beforeEach(async () => {
    await resetDatabase(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("allocates distinct daily sequences during concurrent creation", async () => {
    const { clientId } = await createFixtures();

    const orders = await Promise.all([
      createOrder(prisma, orderInput(clientId, "First Order")),
      createOrder(prisma, orderInput(clientId, "Second Order")),
    ]);

    expect(orders.map((order) => order.code).sort()).toEqual([
      "VRLY_260726_001",
      "VRLY_260726_002",
    ]);
    await expect(prisma.order.count()).resolves.toBe(2);
  });

  it("uses a valid fallback folder name when the title sanitises to nothing", async () => {
    const { clientId } = await createFixtures();
    const order = await createOrder(prisma, orderInput(clientId, '<>:"/\\|?*'));

    expect(order.folderName).toBe("VRLY_260726_001__untitled");
    expect(order.backupPath).toBe(`${env.BACKUP_ROOT_UNC}\\Verily\\VRLY_260726_001__untitled`);
  });

  it("rejects an over-budget destination before any transactional row is retained", async () => {
    const { clientId } = await createFixtures();
    const overBudgetRoot = `\\\\ci-host\\Production\\${"r".repeat(90)}`;

    await expect(
      createOrder(prisma, {
        ...orderInput(clientId, "overlong ".repeat(100)),
        backupRoot: overBudgetRoot,
      }),
    ).rejects.toThrow(PathBudgetError);
    await expect(prisma.order.count()).resolves.toBe(0);
    await expect(prisma.orderBatch.count()).resolves.toBe(0);
    await expect(prisma.sourceLink.count()).resolves.toBe(0);
    await expect(prisma.orderEvent.count()).resolves.toBe(0);
    await expect(prisma.auditEvent.count()).resolves.toBe(0);
  });

  it("creates the initial batch, links, order event, and audit in one transaction", async () => {
    const { clientId } = await createFixtures();
    const order = await createOrder(prisma, orderInput(clientId));
    const persisted = await prisma.order.findUniqueOrThrow({
      where: { id: order.id },
      include: {
        batches: { include: { sourceLinks: true } },
        events: true,
      },
    });

    expect(persisted.batches).toHaveLength(1);
    expect(persisted.batches[0]).toMatchObject({
      sequence: 1,
      kind: "INITIAL",
      status: "PENDING",
      subfolder: "01_INITIAL",
      createdById: actor.userId,
    });
    expect(persisted.batches[0]?.sourceLinks).toHaveLength(2);
    expect(persisted.events).toHaveLength(1);
    expect(persisted.events[0]).toMatchObject({
      type: "order.created",
      actorUserId: actor.userId,
      actorLabel: actor.label,
      correlationId,
    });
    await expect(
      prisma.auditEvent.findFirst({
        where: { entityType: "Order", entityId: order.id },
      }),
    ).resolves.toMatchObject({
      action: "order.created",
      actorUserId: actor.userId,
      correlationId,
    });
  });

  it("rolls back order data if the final audit write fails", async () => {
    const { clientId } = await createFixtures();
    const input = orderInput(clientId);

    await expect(
      createOrder(prisma, {
        ...input,
        actor: {
          userId: "33333333-3333-4333-8333-333333333333",
          label: "Missing Actor",
        },
      }),
    ).rejects.toThrow();
    await expect(prisma.order.count()).resolves.toBe(0);
    await expect(prisma.orderBatch.count()).resolves.toBe(0);
    await expect(prisma.sourceLink.count()).resolves.toBe(0);
    await expect(prisma.orderEvent.count()).resolves.toBe(0);
    await expect(prisma.auditEvent.count()).resolves.toBe(0);
  });
});
