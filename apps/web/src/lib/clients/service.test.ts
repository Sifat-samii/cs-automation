import { prisma } from "@cs/db";
import { resetDatabase } from "@cs/db/testing";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  createClient,
  listUnboundFolders,
  resolveClientByEmail,
  type DirectoryEntry,
} from "@/lib/clients/service";

const actor = {
  userId: "11111111-1111-4111-8111-111111111111",
  label: "Sifat Sami",
};
const correlationId = "22222222-2222-4222-8222-222222222222";

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
  folderName: string,
  identities: readonly { kind: "ADDRESS" | "DOMAIN"; value: string }[],
) {
  return createClient(prisma, {
    code,
    displayName: `${code} Client`,
    folderName,
    identities,
    actor,
    correlationId,
  });
}

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

  it("lists only unbound directories and excludes _Final Done and files", async () => {
    await registerClient("BOUND", "Bound Client", []);
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
