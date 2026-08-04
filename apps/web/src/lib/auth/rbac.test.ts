import { describe, expect, it } from "vitest";
import { ForbiddenError, assertCan, can } from "./rbac";

describe("role permissions", () => {
  it("grants user management to CS_LEAD only", () => {
    expect(can("CS_LEAD", "user:manage")).toBe(true);
    expect(can("CS_EXECUTIVE", "user:manage")).toBe(false);
  });

  it("grants audit reading to CS_LEAD only", () => {
    expect(can("CS_LEAD", "audit:read")).toBe(true);
    expect(can("CS_EXECUTIVE", "audit:read")).toBe(false);
  });

  it("grants client management to CS_LEAD only", () => {
    expect(can("CS_LEAD", "client:manage")).toBe(true);
    expect(can("CS_LEAD", "client:read")).toBe(true);
    expect(can("CS_EXECUTIVE", "client:manage")).toBe(false);
    expect(can("CS_EXECUTIVE", "client:read")).toBe(true);
  });

  it("grants order writing to both CS roles", () => {
    expect(can("CS_LEAD", "order:write")).toBe(true);
    expect(can("CS_EXECUTIVE", "order:write")).toBe(true);
  });

  it("assertCan passes for a permitted role", () => {
    expect(() => assertCan("CS_LEAD", "user:manage")).not.toThrow();
  });

  it("assertCan throws ForbiddenError naming the permission", () => {
    try {
      assertCan("CS_EXECUTIVE", "user:manage");
      expect.unreachable("should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(ForbiddenError);
      expect((error as ForbiddenError).permission).toBe("user:manage");
    }
  });
});
