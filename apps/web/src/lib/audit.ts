import type { DbClient, Prisma } from "@cs/db";

export type AuditInput = {
  correlationId: string;
  actorUserId: string | null;
  actorLabel: string;
  action: string;
  entityType: string;
  entityId: string;
  metadata?: Record<string, unknown>;
};

const SENSITIVE_KEY = /pass|secret|token|authorization|credential|cookie|hash/i;

function toJsonValue(value: unknown): Prisma.InputJsonValue | null {
  if (value === null) return null;
  if (typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (Array.isArray(value)) return value.map(toJsonValue);
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") return redact(value as Record<string, unknown>);
  return null;
}

function redact(metadata: Record<string, unknown>): Prisma.InputJsonObject {
  const output: Record<string, Prisma.InputJsonValue | null> = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (SENSITIVE_KEY.test(key)) {
      output[key] = "[redacted]";
    } else {
      output[key] = toJsonValue(value);
    }
  }
  return output;
}

export async function recordAudit(db: DbClient, input: AuditInput): Promise<void> {
  await db.auditEvent.create({
    data: {
      correlationId: input.correlationId,
      actorUserId: input.actorUserId,
      actorLabel: input.actorLabel,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      metadata: redact(input.metadata ?? {}),
    },
  });
}

export { redact as redactForTesting };
