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
  formData.set("folderName", "Verily");
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
    await expect(prisma.client.count()).resolves.toBe(0);
  });

  it("creates and audits a client, then revalidates and redirects", async () => {
    await expect(createClientAction(initialState, clientForm())).rejects.toThrow(
      "redirect:/clients",
    );

    await expect(prisma.client.findUnique({ where: { code: "VRLY" } })).resolves.toMatchObject({
      displayName: "Verily",
      folderName: "Verily",
    });
    await expect(
      prisma.auditEvent.findFirst({ where: { action: "client.created" } }),
    ).resolves.toMatchObject({ actorUserId: actor.userId });
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
