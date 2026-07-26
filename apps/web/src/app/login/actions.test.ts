import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@cs/db";
import { resetDatabase } from "@cs/db/testing";
import { hashPassword } from "@cs/shared";
import { hashSessionToken } from "@/lib/auth/session";

const mocks = vi.hoisted(() => {
  const cookieStore = {
    get: vi.fn(),
    set: vi.fn(),
    delete: vi.fn(),
  };

  return {
    cookieStore,
    redirect: vi.fn((path: string) => {
      throw new Error(`redirect:${path}`);
    }),
  };
});

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => mocks.cookieStore),
}));

vi.mock("next/navigation", () => ({
  redirect: mocks.redirect,
}));

import { signIn, signOut, type SignInState } from "./actions";

const initialState: SignInState = { error: null };

async function makeUser() {
  return prisma.user.create({
    data: {
      loginId: "2061",
      displayName: "Sifat Sami",
      passwordHash: await hashPassword("correct-test-password"),
      role: "CS_LEAD",
    },
  });
}

function credentials(loginId: string, password: string): FormData {
  const form = new FormData();
  form.set("loginId", loginId);
  form.set("password", password);
  return form;
}

describe("login actions", () => {
  beforeEach(async () => {
    await resetDatabase(prisma);
    vi.clearAllMocks();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("returns the same error for unknown IDs and bad passwords", async () => {
    await makeUser();

    const unknown = await signIn(initialState, credentials("9999", "wrong-password"));
    const badPassword = await signIn(initialState, credentials("2061", "wrong-password"));

    expect(unknown).toEqual({ error: "Those credentials are not valid." });
    expect(badPassword).toEqual(unknown);
    await expect(
      prisma.auditEvent.count({ where: { action: "user.sign_in_failed" } }),
    ).resolves.toBe(2);
  });

  it("creates a hashed session, secure cookie settings, and audit event", async () => {
    const user = await makeUser();

    await expect(
      signIn(initialState, credentials("2061", "correct-test-password")),
    ).rejects.toThrow("redirect:/dashboard");

    expect(mocks.cookieStore.set).toHaveBeenCalledOnce();
    const [cookieName, rawToken, options] = mocks.cookieStore.set.mock.calls[0] ?? [];
    expect(cookieName).toBe("cs_session");
    expect(typeof rawToken).toBe("string");
    expect(options).toMatchObject({
      httpOnly: true,
      sameSite: "lax",
      secure: false,
      path: "/",
    });
    expect(options?.expires).toBeInstanceOf(Date);

    const session = await prisma.session.findFirstOrThrow({ where: { userId: user.id } });
    expect(session.tokenHash).toBe(hashSessionToken(String(rawToken)));
    expect(session.tokenHash).not.toBe(rawToken);

    const event = await prisma.auditEvent.findFirstOrThrow({ where: { action: "user.signed_in" } });
    expect(event.actorLabel).toBe("2061");
    expect(mocks.redirect).toHaveBeenCalledWith("/dashboard");
  });

  it("invalidates the current session and deletes the cookie on sign-out", async () => {
    const user = await makeUser();
    await expect(
      signIn(initialState, credentials("2061", "correct-test-password")),
    ).rejects.toThrow("redirect:/dashboard");

    const rawToken = mocks.cookieStore.set.mock.calls[0]?.[1];
    expect(typeof rawToken).toBe("string");
    mocks.cookieStore.get.mockReturnValue({ value: rawToken });
    mocks.redirect.mockClear();

    await expect(signOut()).rejects.toThrow("redirect:/login");

    await expect(prisma.session.count({ where: { userId: user.id } })).resolves.toBe(0);
    expect(mocks.cookieStore.delete).toHaveBeenCalledWith("cs_session");
    expect(mocks.redirect).toHaveBeenCalledWith("/login");
  });
});
