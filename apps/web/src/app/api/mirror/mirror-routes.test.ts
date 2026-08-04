import { prisma } from "@cs/db";
import { resetDatabase } from "@cs/db/testing";
import { parseServerEnv, signRequest } from "@cs/shared";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { POST as doneRoute } from "@/app/api/mirror/[id]/done/route";
import { GET as pendingRoute } from "@/app/api/mirror/pending/route";
import { AGENT_SIGNATURE_HEADER, AGENT_TIMESTAMP_HEADER } from "@/lib/agent/http";
import { createOrder } from "@/lib/orders/create";

const secret = "0123456789abcdef0123456789abcdef";
const actor = {
  userId: "11111111-1111-4111-8111-111111111111",
  label: "Sifat Sami",
};
const env = parseServerEnv(process.env);

function signedRequest(url: string, method: "GET" | "POST", value?: unknown): Request {
  const body = value === undefined ? "" : JSON.stringify(value);
  const timestamp = String(Math.floor(Date.now() / 1_000));
  return new Request(url, {
    method,
    headers: {
      ...(value === undefined ? {} : { "content-type": "application/json" }),
      [AGENT_TIMESTAMP_HEADER]: timestamp,
      [AGENT_SIGNATURE_HEADER]: signRequest({ secret, timestamp, body }),
    },
    ...(value === undefined ? {} : { body }),
  });
}

const params = (id: string) => ({ params: Promise.resolve({ id }) });

describe("HMAC sheet mirror routes", () => {
  beforeEach(async () => {
    await resetDatabase(prisma);
    process.env.INGEST_HMAC_SECRET = secret;
    await prisma.user.create({
      data: {
        id: actor.userId,
        loginId: "2061",
        displayName: actor.label,
        passwordHash: "test-only-password-hash",
        role: "CS_LEAD",
      },
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("rejects unsigned pending requests", async () => {
    const response = await pendingRoute(new Request("http://127.0.0.1/api/mirror/pending"));
    expect(response.status).toBe(401);
  });

  it("claims pending mirror rows and marks them done", async () => {
    const client = await prisma.client.create({
      data: { code: "FN", displayName: "FN", folderName: "FN" },
    });
    await createOrder(prisma, {
      clientId: client.id,
      title: "FN 02-20-26_Zea",
      orderType: "Retouching",
      quantity: 210,
      actor,
      correlationId: "22222222-2222-4222-8222-222222222222",
      createdAt: new Date("2026-02-23T12:00:00.000Z"),
      backupRoot: env.BACKUP_ROOT_UNC,
      productionRoot: env.PRODUCTION_ROOT_UNC,
    });

    const pending = await pendingRoute(
      signedRequest("http://127.0.0.1/api/mirror/pending?limit=10", "GET"),
    );
    expect(pending.status).toBe(200);
    const pendingBody = (await pending.json()) as {
      mirror: Array<{ id: string; row: Record<string, string>; blankRowAfter: boolean }>;
    };
    expect(pendingBody.mirror).toHaveLength(1);
    expect(pendingBody.mirror[0]?.row).toEqual({
      Date: "23/02/2026",
      Client: "FN",
      "Order Name": "FN 02-20-26_Zea",
      Quantity: "210",
    });
    expect(pendingBody.mirror[0]?.blankRowAfter).toBe(true);

    const id = pendingBody.mirror[0]!.id;
    const done = await doneRoute(
      signedRequest(`http://127.0.0.1/api/mirror/${id}/done`, "POST", {
        providerRowKey: "sheet-row-12",
      }),
      params(id),
    );
    expect(done.status).toBe(200);
    await expect(done.json()).resolves.toEqual({
      mirror: { id, status: "DONE", providerRowKey: "sheet-row-12" },
    });
  });
});
