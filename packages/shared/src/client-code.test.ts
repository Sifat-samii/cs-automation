import { describe, expect, it } from "vitest";
import { allocateUniqueClientCode, deriveClientCode } from "./client-code.js";

describe("deriveClientCode", () => {
  it("derives alphanumeric codes from messy names", () => {
    expect(deriveClientCode("R&C")).toMatch(/^[A-Z0-9]{2,12}$/);
    expect(deriveClientCode("SJC & JAG")).toMatch(/^[A-Z0-9]{2,12}$/);
    expect(deriveClientCode("Vrly")).toBe("VRLY");
    expect(deriveClientCode("Affordable Golf").length).toBeLessThanOrEqual(12);
  });
});

describe("allocateUniqueClientCode", () => {
  it("appends numeric suffixes on collision", () => {
    const existing = new Set(["BR", "BR2"]);
    expect(allocateUniqueClientCode("BR", existing)).toBe("BR3");
  });
});
