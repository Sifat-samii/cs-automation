import { prisma } from "@cs/db";
import { resetDatabase } from "@cs/db/testing";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

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

import { createOrderAction, type OrderActionState } from "@/app/(app)/orders/actions";

const initialState: OrderActionState = { error: null };
const actor = {
  userId: "11111111-1111-4111-8111-111111111111",
  loginId: "2061",
  displayName: "Sifat Sami",
  role: "CS_EXECUTIVE" as const,
};

async function createFixtures(): Promise<string> {
  await prisma.user.create({
    data: {
      id: actor.userId,
      loginId: actor.loginId,
      displayName: actor.displayName,
      passwordHash: "test-only-password-hash",
      role: actor.role,
    },
  });
  const client = await prisma.client.create({
    data: {
      code: "VRLY",
      displayName: "Verily",
      folderName: "Verily",
    },
  });
  return client.id;
}

function orderForm(clientId: string): FormData {
  const formData = new FormData();
  formData.set("clientId", clientId);
  formData.set("title", "Kirkland Spring Drop");
  formData.set("orderType", "Retouching");
  formData.set("quantity", "24");
  formData.set("sourceKind", "DROPBOX");
  formData.set("sourceUrl", "https://example.com/source");
  return formData;
}

describe("order actions", () => {
  beforeEach(async () => {
    await resetDatabase(prisma);
    vi.clearAllMocks();
    mocks.requireUser.mockResolvedValue(actor);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("allows a CS executive to create an order and redirects to its detail", async () => {
    const clientId = await createFixtures();

    await expect(createOrderAction(initialState, orderForm(clientId))).rejects.toThrow(
      /redirect:\/orders\//u,
    );
    const order = await prisma.order.findFirstOrThrow();
    const dateTag = new Date().toISOString().slice(2, 10).replaceAll("-", "");
    expect(order.folderName).toBe(`VRLY_${dateTag}_001__kirkland_spring_drop`);
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/orders");
    expect(mocks.redirect).toHaveBeenCalledWith(`/orders/${order.id}`);
  });

  it("returns a safe validation error without creating partial rows", async () => {
    const clientId = await createFixtures();
    const formData = orderForm(clientId);
    formData.set("quantity", "0");

    await expect(createOrderAction(initialState, formData)).resolves.toEqual({
      error: "Check the order details and try again.",
    });
    await expect(prisma.order.count()).resolves.toBe(0);
    await expect(prisma.orderBatch.count()).resolves.toBe(0);
  });
});
