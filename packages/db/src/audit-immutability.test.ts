import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "./index.js";
import { resetDatabase } from "./testing.js";

const correlationId = "11111111-1111-4111-8111-111111111111";

async function insertEvent() {
  return prisma.auditEvent.create({
    data: {
      correlationId,
      actorUserId: null,
      actorLabel: "system",
      action: "test.performed",
      entityType: "Test",
      entityId: "1",
    },
  });
}

describe("AuditEvent immutability", () => {
  beforeEach(async () => {
    await resetDatabase(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("allows inserts", async () => {
    const event = await insertEvent();
    expect(event.id).toBeTruthy();
    expect(event.metadata).toEqual({});
  });

  it("refuses updates at the database level", async () => {
    const event = await insertEvent();
    await expect(
      prisma.auditEvent.update({ where: { id: event.id }, data: { action: "tampered" } }),
    ).rejects.toThrow(/append-only/i);
  });

  it("refuses deletes at the database level", async () => {
    const event = await insertEvent();
    await expect(prisma.auditEvent.delete({ where: { id: event.id } })).rejects.toThrow(
      /append-only/i,
    );
  });

  it("stores timestamps with timezone in UTC", async () => {
    const event = await insertEvent();
    expect(event.occurredAt.toISOString()).toMatch(/Z$/);
  });
});
