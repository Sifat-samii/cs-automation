import type { PrismaClient } from "@prisma/client";

export async function resetDatabase(client: PrismaClient): Promise<void> {
  if (!process.env.DATABASE_URL?.includes("_test")) {
    throw new Error("resetDatabase refused: DATABASE_URL does not point at a test database");
  }
  await client.$executeRawUnsafe(
    'TRUNCATE TABLE "SourceLink", "OrderEvent", "OrderBatch", "Order", "ClientIdentity", "Client", "AuditEvent", "Session", "User" RESTART IDENTITY CASCADE',
  );
}
