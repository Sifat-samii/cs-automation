import { prisma } from "@cs/db";
import { resetDatabase } from "@cs/db/testing";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { PHASE5_CLIENT_DISPLAY_NAMES, seedClients } from "./seed-clients.js";

describe("seedClients", () => {
  beforeEach(async () => {
    await resetDatabase(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("creates each display name once and is idempotent on replay", async () => {
    const first = await seedClients(prisma);
    expect(first.created).toBe(PHASE5_CLIENT_DISPLAY_NAMES.length);
    expect(first.skipped).toBe(0);
    await expect(prisma.client.count()).resolves.toBe(PHASE5_CLIENT_DISPLAY_NAMES.length);

    const second = await seedClients(prisma);
    expect(second.created).toBe(0);
    expect(second.skipped).toBe(PHASE5_CLIENT_DISPLAY_NAMES.length);
    await expect(prisma.client.count()).resolves.toBe(PHASE5_CLIENT_DISPLAY_NAMES.length);

    const codes = await prisma.client.findMany({ select: { code: true } });
    expect(new Set(codes.map((row) => row.code)).size).toBe(codes.length);
  });
});
