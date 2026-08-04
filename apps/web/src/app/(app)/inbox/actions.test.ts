import { prisma } from "@cs/db";
import { resetDatabase } from "@cs/db/testing";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ForbiddenError } from "@/lib/auth/rbac";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  redirect: vi.fn((path: string) => {
    throw new Error(`redirect:${path}`);
  }),
  revalidatePath: vi.fn(),
  createClient: vi.fn(),
}));

vi.mock("@/lib/auth/current-user", () => ({
  requireUser: mocks.requireUser,
}));
vi.mock("next/navigation", () => ({
  redirect: mocks.redirect,
}));
vi.mock("next/cache", () => ({
  revalidatePath: mocks.revalidatePath,
}));
vi.mock("@/lib/clients/service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/clients/service")>();
  return {
    ...actual,
    createClient: mocks.createClient,
  };
});

import {
  createClientFromInboxAction,
  type InboxClientActionState,
} from "@/app/(app)/inbox/actions";

const initialState: InboxClientActionState = { error: null };
const actor = {
  userId: "11111111-1111-4111-8111-111111111111",
  loginId: "2061",
  displayName: "Sifat Sami",
  role: "CS_LEAD" as const,
};
const emailMessageId = "22222222-2222-4222-8222-222222222222";

function inboxClientForm(overrides: Record<string, string> = {}): FormData {
  const formData = new FormData();
  formData.set("emailMessageId", emailMessageId);
  formData.set("displayName", "Inbox Pilot Client");
  formData.set("code", "");
  formData.set("address", "orders@pilot.example");
  for (const [key, value] of Object.entries(overrides)) {
    formData.set(key, value);
  }
  return formData;
}

describe("createClientFromInboxAction", () => {
  beforeEach(async () => {
    await resetDatabase(prisma);
    await prisma.user.create({
      data: {
        id: actor.userId,
        loginId: actor.loginId,
        displayName: actor.displayName,
        passwordHash: "test-only-password-hash",
        role: actor.role,
      },
    });
    vi.clearAllMocks();
    mocks.requireUser.mockResolvedValue(actor);
    mocks.createClient.mockImplementation(async (_db, input) => {
      return prisma.client.create({
        data: {
          code: String(input.code).toUpperCase(),
          displayName: input.displayName,
          folderName: input.displayName,
          identities: {
            create: (input.identities ?? []).map(
              (identity: { kind: "ADDRESS" | "DOMAIN"; value: string }) => ({
                kind: identity.kind,
                value: identity.value.toLowerCase(),
              }),
            ),
          },
        },
      });
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("enforces client:manage inside the server action", async () => {
    mocks.requireUser.mockResolvedValue({
      ...actor,
      role: "CS_EXECUTIVE",
    });

    await expect(createClientFromInboxAction(initialState, inboxClientForm())).rejects.toThrow(
      ForbiddenError,
    );
    await expect(prisma.client.count()).resolves.toBe(0);
  });

  it("creates a client with ADDRESS identity and redirects with clientId", async () => {
    await expect(createClientFromInboxAction(initialState, inboxClientForm())).rejects.toThrow(
      /^redirect:\/inbox\/22222222-2222-4222-8222-222222222222\?clientId=/,
    );

    const client = await prisma.client.findFirst({
      where: { displayName: "Inbox Pilot Client" },
      include: { identities: true },
    });
    expect(client).toMatchObject({
      code: "INBOXPILOTCL",
      folderName: "Inbox Pilot Client",
    });
    expect(client?.identities).toEqual([
      expect.objectContaining({ kind: "ADDRESS", value: "orders@pilot.example" }),
    ]);
    expect(mocks.createClient).toHaveBeenCalledTimes(1);
    const createArgs = mocks.createClient.mock.calls[0]?.[1] as {
      displayName: string;
      backupRoot: string;
      productionRoot: string;
    };
    expect(createArgs.displayName).toBe("Inbox Pilot Client");
    expect(createArgs.backupRoot.length).toBeGreaterThan(0);
    expect(createArgs.productionRoot.length).toBeGreaterThan(0);
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/clients");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/inbox");
    expect(mocks.revalidatePath).toHaveBeenCalledWith(`/inbox/${emailMessageId}`);
    expect(mocks.redirect).toHaveBeenCalledWith(
      expect.stringMatching(new RegExp(`^/inbox/${emailMessageId}\\?clientId=${client?.id}$`)),
    );
  });

  it("returns a safe validation error instead of throwing raw details", async () => {
    await expect(
      createClientFromInboxAction(
        initialState,
        inboxClientForm({ displayName: "", emailMessageId: "not-a-uuid" }),
      ),
    ).resolves.toEqual({
      error: "Check the client details and try again.",
    });
  });
});
