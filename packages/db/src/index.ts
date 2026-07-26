import { PrismaClient } from "@prisma/client";
import type { Prisma } from "@prisma/client";

export type DbClient = PrismaClient | Prisma.TransactionClient;

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma: PrismaClient =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

export { Prisma, PrismaClient } from "@prisma/client";
export type {
  User,
  Session,
  AuditEvent,
  UserRole,
  TransferErrorClass,
  TransferJob,
  TransferJobKind,
  TransferJobStatus,
  FileArtifact,
  FileArtifactStage,
} from "@prisma/client";
