import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@cs/db";
import { resetDatabase } from "@cs/db/testing";
import { hashPassword } from "@cs/shared";
import { recordAudit } from "./audit";

const correlationId = "22222222-2222-4222-8222-222222222222";

async function makeUser() {
  return prisma.user.create({
    data: {
      loginId: "9001",
      email: "lead@example.com",
      displayName: "Test Lead",
      passwordHash: await hashPassword("a-long-enough-password"),
      role: "CS_LEAD",
    },
  });
}

describe("recordAudit", () => {
  beforeEach(async () => {
    await resetDatabase(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("writes an event with actor and entity", async () => {
    const user = await makeUser();
    await recordAudit(prisma, {
      correlationId,
      actorUserId: user.id,
      actorLabel: user.loginId,
      action: "user.signed_in",
      entityType: "User",
      entityId: user.id,
    });

    const events = await prisma.auditEvent.findMany();
    expect(events).toHaveLength(1);
    expect(events[0]?.action).toBe("user.signed_in");
    expect(events[0]?.actorUserId).toBe(user.id);
  });

  it("redacts sensitive keys from metadata", async () => {
    await recordAudit(prisma, {
      correlationId,
      actorUserId: null,
      actorLabel: "system",
      action: "integration.called",
      entityType: "Integration",
      entityId: "n8n",
      metadata: {
        endpoint: "/api/ingest/email",
        password: "hunter2",
        apiToken: "abc",
        authorization: "Bearer xyz",
        hmacSecret: "s3cret",
      },
    });

    const event = await prisma.auditEvent.findFirstOrThrow();
    const metadata = event.metadata as Record<string, unknown>;
    expect(metadata.endpoint).toBe("/api/ingest/email");
    expect(metadata.password).toBe("[redacted]");
    expect(metadata.apiToken).toBe("[redacted]");
    expect(metadata.authorization).toBe("[redacted]");
    expect(metadata.hmacSecret).toBe("[redacted]");
  });

  it("rolls back with the surrounding transaction", async () => {
    const user = await makeUser();

    await expect(
      prisma.$transaction(async (tx) => {
        await tx.user.update({ where: { id: user.id }, data: { displayName: "Renamed" } });
        await recordAudit(tx, {
          correlationId,
          actorUserId: user.id,
          actorLabel: user.loginId,
          action: "user.renamed",
          entityType: "User",
          entityId: user.id,
        });
        throw new Error("deliberate failure");
      }),
    ).rejects.toThrow("deliberate failure");

    await expect(prisma.auditEvent.count()).resolves.toBe(0);
    const unchanged = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(unchanged.displayName).toBe("Test Lead");
  });

  it("refuses deleting an audited actor and preserves its identity", async () => {
    const user = await makeUser();
    await recordAudit(prisma, {
      correlationId,
      actorUserId: user.id,
      actorLabel: user.loginId,
      action: "user.signed_in",
      entityType: "User",
      entityId: user.id,
    });

    await expect(prisma.user.delete({ where: { id: user.id } })).rejects.toThrow(
      /foreign key constraint/i,
    );

    const event = await prisma.auditEvent.findFirstOrThrow();
    expect(event.actorUserId).toBe(user.id);
    expect(event.actorLabel).toBe("9001");
  });
});
