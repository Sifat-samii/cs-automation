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

import { createClientAction, type ClientActionState } from "@/app/(app)/clients/actions";

const initialState: ClientActionState = { error: null };
const actor = {
  userId: "11111111-1111-4111-8111-111111111111",
  loginId: "2061",
  displayName: "Sifat Sami",
  role: "CS_LEAD" as const,
};

function clientForm(): FormData {
  const formData = new FormData();
  formData.set("code", "VRLY");
  formData.set("displayName", "Verily");
  formData.set("address", "orders@example.com");
  formData.set("domain", "example.com");
  return formData;
}

describe("client actions", () => {
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
            create: [
              ...(input.identities ?? []).map(
                (identity: { kind: "ADDRESS" | "DOMAIN"; value: string }) => ({
                  kind: identity.kind,
                  value: identity.value.toLowerCase(),
                }),
              ),
            ],
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

    await expect(createClientAction(initialState, clientForm())).rejects.toThrow(ForbiddenError);
    expect(mocks.createClient).not.toHaveBeenCalled();
    await expect(prisma.client.count()).resolves.toBe(0);
  });

  it("creates a client without a folder form field, then revalidates and redirects", async () => {
    await expect(createClientAction(initialState, clientForm())).rejects.toThrow(
      "redirect:/clients",
    );

    expect(mocks.createClient).toHaveBeenCalledTimes(1);
    const createArgs = mocks.createClient.mock.calls[0]?.[1] as {
      code: string;
      displayName: string;
      folderName?: string;
      backupRoot: string;
      productionRoot: string;
    };
    expect(createArgs.code).toBe("VRLY");
    expect(createArgs.displayName).toBe("Verily");
    expect(createArgs.folderName).toBeUndefined();
    expect(createArgs.backupRoot.length).toBeGreaterThan(0);
    expect(createArgs.productionRoot.length).toBeGreaterThan(0);
    await expect(prisma.client.findUnique({ where: { code: "VRLY" } })).resolves.toMatchObject({
      displayName: "Verily",
      folderName: "Verily",
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/clients");
    expect(mocks.redirect).toHaveBeenCalledWith("/clients");
  });

  it("returns a safe validation error instead of throwing raw details", async () => {
    const formData = clientForm();
    formData.set("code", "!");

    await expect(createClientAction(initialState, formData)).resolves.toEqual({
      error: "Check the client details and try again.",
    });
  });
});
