import { prisma } from "@cs/db";
import { resetDatabase } from "@cs/db/testing";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { extractFromEmail } from "@/lib/ingest/extract";

const actorUserId = "11111111-1111-4111-8111-111111111111";

async function createFixtures(): Promise<{ clientId: string; orderId: string }> {
  await prisma.user.create({
    data: {
      id: actorUserId,
      loginId: "2061",
      displayName: "Sifat Sami",
      passwordHash: "test-only-password-hash",
      role: "CS_LEAD",
    },
  });
  const client = await prisma.client.create({
    data: {
      code: "VRLY",
      displayName: "Verily",
      folderName: "Verily",
      identities: {
        create: [
          { kind: "DOMAIN", value: "example.com" },
          { kind: "ADDRESS", value: "priority@another.example" },
        ],
      },
    },
  });
  const order = await prisma.order.create({
    data: {
      code: "VRLY_260726_001",
      clientId: client.id,
      title: "Spring Drop",
      orderType: "Standard",
      gmailThreadId: "thread-existing",
      folderName: "VRLY_260726_001__spring_drop",
      backupPath: "\\\\server\\backup\\Verily\\VRLY_260726_001__spring_drop",
      productionPath: "\\\\server\\production\\Verily\\VRLY_260726_001__spring_drop",
      createdById: actorUserId,
    },
  });
  return { clientId: client.id, orderId: order.id };
}

describe("deterministic email extraction", () => {
  beforeEach(async () => {
    await resetDatabase(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("resolves the sender and correlates an existing Gmail thread", async () => {
    const fixture = await createFixtures();
    const extraction = await extractFromEmail(prisma, {
      gmailThreadId: "thread-existing",
      fromAddress: "buyer@example.com",
      subject: "More files",
      bodyText: "Attached.",
    });
    expect(extraction).toMatchObject({
      clientId: fixture.clientId,
      orderId: fixture.orderId,
    });
  });

  it("extracts bounded provider URLs and attachment names without swallowing prose", async () => {
    await createFixtures();
    const extraction = await extractFromEmail(prisma, {
      gmailThreadId: "thread-new",
      fromAddress: "buyer@example.com",
      subject: "Files",
      bodyText:
        "Dropbox: https://www.dropbox.com/s/abc/files.zip?dl=0. Drive: https://drive.google.com/file/d/xyz/view, thanks. Ignore https://evil.example/drive.google.com/file.",
      attachments: [
        { filename: " brief.zip " },
        { filename: "brief.zip" },
        { filename: "reference.jpg" },
      ],
    });
    expect(extraction.dropboxUrls).toEqual(["https://www.dropbox.com/s/abc/files.zip?dl=0"]);
    expect(extraction.driveUrls).toEqual(["https://drive.google.com/file/d/xyz/view"]);
    expect(extraction.attachmentNames).toEqual(["brief.zip", "reference.jpg"]);
  });

  it("returns null identifiers for an unknown sender and thread", async () => {
    await createFixtures();
    await expect(
      extractFromEmail(prisma, {
        gmailThreadId: "thread-unknown",
        fromAddress: "unknown@outside.example",
        subject: "Hello",
        bodyText: "",
      }),
    ).resolves.toMatchObject({ clientId: null, orderId: null });
  });
});
