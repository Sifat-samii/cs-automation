import { prisma } from "@cs/db";
import { resetDatabase } from "@cs/db/testing";
import { parseServerEnv } from "@cs/shared";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createClient,
  deriveClientFolderName,
  listUnboundFolders,
  resolveClientByEmail,
  type DirectoryEntry,
} from "@/lib/clients/service";

const actor = {
  userId: "11111111-1111-4111-8111-111111111111",
  label: "Sifat Sami",
};
const correlationId = "22222222-2222-4222-8222-222222222222";
const env = parseServerEnv(process.env);

async function createActor(): Promise<void> {
  await prisma.user.create({
    data: {
      id: actor.userId,
      loginId: "2061",
      displayName: actor.label,
      passwordHash: "test-only-password-hash",
      role: "CS_LEAD",
    },
  });
}

async function registerClient(
  code: string,
  displayName: string,
  identities: readonly { kind: "ADDRESS" | "DOMAIN"; value: string }[],
  folderName?: string,
) {
  const ensureDirectory = vi.fn(async () => undefined);
  return createClient(prisma, {
    code,
    displayName,
    ...(folderName ? { folderName } : {}),
    identities,
    backupRoot: env.BACKUP_ROOT_UNC,
    productionRoot: env.PRODUCTION_ROOT_UNC,
    actor,
    correlationId,
    ensureDirectory,
  });
}

describe("deriveClientFolderName", () => {
  it("uses the display name when it is a valid folder segment", () => {
    expect(deriveClientFolderName("Proper Cloth", "PC")).toBe("Proper Cloth");
  });

  it("falls back to code when the display name cannot form a folder", () => {
    expect(deriveClientFolderName("..", "VRLY")).toBe("VRLY");
  });
});

describe("client registry service", () => {
  beforeEach(async () => {
    await resetDatabase(prisma);
    await createActor();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("resolves an exact address before a matching domain", async () => {
    await registerClient("DOMAIN", "Domain Client", [{ kind: "DOMAIN", value: "example.com" }]);
    const exact = await registerClient("EXACT", "Exact Client", [
      { kind: "ADDRESS", value: "orders@example.com" },
    ]);

    await expect(resolveClientByEmail(prisma, "orders@example.com")).resolves.toMatchObject({
      id: exact.id,
    });
  });

  it("matches addresses and domains case-insensitively", async () => {
    const addressClient = await registerClient("ADDR", "Address Client", [
      { kind: "ADDRESS", value: "Person@Example.com" },
    ]);
    const domainClient = await registerClient("OTHER", "Other Client", [
      { kind: "DOMAIN", value: "another.example" },
    ]);

    await expect(resolveClientByEmail(prisma, "PERSON@EXAMPLE.COM")).resolves.toMatchObject({
      id: addressClient.id,
    });
    await expect(resolveClientByEmail(prisma, "buyer@ANOTHER.EXAMPLE")).resolves.toMatchObject({
      id: domainClient.id,
    });
  });

  it("returns null for an unknown sender rather than guessing", async () => {
    await expect(resolveClientByEmail(prisma, "unknown@example.com")).resolves.toBeNull();
  });

  it("rejects client codes that differ only by case", async () => {
    await registerClient("vrly", "First Client", []);
    await expect(registerClient("VRLY", "Second Client", [])).rejects.toMatchObject({
      code: "P2002",
    });
  });

  it("writes an audit event in the client transaction", async () => {
    const client = await registerClient("AUDIT", "Audit Client", []);
    await expect(
      prisma.auditEvent.findFirst({
        where: { entityType: "Client", entityId: client.id },
      }),
    ).resolves.toMatchObject({
      actorUserId: actor.userId,
      actorLabel: actor.label,
      action: "client.created",
      correlationId,
    });
  });

  it("derives folderName from displayName and ensures share folders before insert", async () => {
    const ensureDirectory = vi.fn(async (_path: string) => undefined);
    const client = await createClient(prisma, {
      code: "FN",
      displayName: "FN Studio",
      identities: [],
      backupRoot: env.BACKUP_ROOT_UNC,
      productionRoot: env.PRODUCTION_ROOT_UNC,
      actor,
      correlationId,
      ensureDirectory,
    });
    expect(client.folderName).toBe("FN Studio");
    expect(ensureDirectory).toHaveBeenCalledTimes(2);
    expect(String(ensureDirectory.mock.calls[0]?.[0])).toContain("FN Studio");
    expect(String(ensureDirectory.mock.calls[1]?.[0])).toContain("FN Studio");
  });

  it("lists only unbound directories and excludes _Final Done and files", async () => {
    await registerClient("BOUND", "Bound Client", [], "Bound Client");
    const entries: readonly DirectoryEntry[] = [
      { name: "_Final Done", isDirectory: () => true },
      { name: "Bound Client", isDirectory: () => true },
      { name: "Open Client", isDirectory: () => true },
      { name: "instructions.txt", isDirectory: () => false },
    ];
    const readDirectory = async () => entries;

    await expect(listUnboundFolders(prisma, "\\\\server\\share", readDirectory)).resolves.toEqual([
      "Open Client",
    ]);
  });
});
