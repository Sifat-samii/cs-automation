import { describe, expect, it } from "vitest";
import { packageName } from "./index.js";

describe("@cs/shared", () => {
  it("is wired into the workspace", () => {
    expect(packageName).toBe("@cs/shared");
  });
});
