import { describe, expect, it } from "vitest";
import {
  PathBudgetError,
  PathTraversalError,
  assertPathBudget,
  buildOrderCode,
  buildOrderFolderName,
  joinUncPath,
  sanitisePathSegment,
  toExtendedLengthPath,
} from "./paths.js";

const backupRoot =
  "\\\\192.168.0.15\\Production\\File Transfer Server\\Sifat_Project Coordinator\\Software test\\_Software Test";

describe("sanitisePathSegment", () => {
  it("strips Windows-illegal characters and ASCII control characters", () => {
    expect(sanitisePathSegment('a<b>c:d"e/f\\g|h?i*j\u0000\u001f\u007f')).toBe("abcdefghij");
  });

  it("collapses whitespace and trims leading and trailing separators", () => {
    expect(sanitisePathSegment("  kirkland \t spring\r\n drop  ")).toBe("kirkland_spring_drop");
  });

  it.each([".", "..", " . ", " .. "])("rejects traversal segment %j", (value) => {
    expect(() => sanitisePathSegment(value)).toThrow(PathTraversalError);
  });

  it.each(["CON", "prn.txt", "Aux", "NUL.log", "com1", "COM9.bin", "lpt1", "LPT9.txt"])(
    "rejects reserved Windows device name %s",
    (value) => {
      expect(() => sanitisePathSegment(value)).toThrow(/reserved Windows device name/i);
    },
  );

  it("strips trailing dots and spaces", () => {
    expect(sanitisePathSegment("proof set...   ")).toBe("proof_set");
  });

  it("preserves non-ASCII letters", () => {
    expect(sanitisePathSegment("Crème 日本語 заказ")).toBe("Crème_日本語_заказ");
  });

  it("returns a stable fallback when nothing remains", () => {
    expect(sanitisePathSegment('<>:"/\\|?*\u0000')).toBe("untitled");
  });
});

describe("buildOrderCode", () => {
  it("uppercases the client code and pads the sequence", () => {
    expect(buildOrderCode("vrly", new Date("2026-07-26T12:00:00.000Z"), 1)).toBe("VRLY_260726_001");
  });

  it("uses the UTC calendar date rather than the local offset date", () => {
    expect(buildOrderCode("fn", new Date("2026-01-01T00:30:00+14:00"), 12)).toBe("FN_251231_012");
  });

  it("enforces the canonical client-code and sequence constraints", () => {
    expect(() => buildOrderCode("x", new Date(), 1)).toThrow(/client code/i);
    expect(() => buildOrderCode("CLIENT-CODE", new Date(), 1)).toThrow(/client code/i);
    expect(() => buildOrderCode("VRLY", new Date(), 0)).toThrow(/sequence/i);
    expect(() => buildOrderCode("VRLY", new Date(), 1000)).toThrow(/sequence/i);
  });
});

describe("buildOrderFolderName", () => {
  it("combines the canonical code with a sanitised title", () => {
    expect(buildOrderFolderName("VRLY_260726_001", "Kirkland Spring Drop")).toBe(
      "VRLY_260726_001__kirkland_spring_drop",
    );
  });

  it("truncates on a word boundary where possible and never ends in an underscore", () => {
    expect(buildOrderFolderName("VRLY_260726_001", "alpha beta gamma delta", 31)).toBe(
      "VRLY_260726_001__alpha_beta",
    );
    expect(buildOrderFolderName("VRLY_260726_001", "averylongsingleword", 26)).toBe(
      "VRLY_260726_001__averylong",
    );
  });

  it("uses the fallback suffix when the title sanitises to nothing", () => {
    expect(buildOrderFolderName("VRLY_260726_001", '<>:"/\\|?*')).toBe("VRLY_260726_001__untitled");
  });
});

describe("UNC path helpers", () => {
  it("joins safe segments under a UNC root", () => {
    expect(joinUncPath("\\\\server\\share", "Client", "Order", "01_INITIAL")).toBe(
      "\\\\server\\share\\Client\\Order\\01_INITIAL",
    );
  });

  it.each(["..", "../outside", "safe\\..\\outside", "\\\\other\\share"])(
    "rejects a segment that could escape the root: %s",
    (segment) => {
      expect(() => joinUncPath("\\\\server\\share", segment)).toThrow(PathTraversalError);
    },
  );

  it("converts a UNC path to extended-length form and is idempotent", () => {
    const normal = "\\\\server\\share\\Client\\Order";
    const extended = "\\\\?\\UNC\\server\\share\\Client\\Order";
    expect(toExtendedLengthPath(normal)).toBe(extended);
    expect(toExtendedLengthPath(extended)).toBe(extended);
  });
});

describe("assertPathBudget", () => {
  it("accepts a realistic path under the real backup root", () => {
    expect(
      assertPathBudget(
        backupRoot,
        ["VRLY", "VRLY_260726_001__spring_drop", "01_INITIAL"],
        "finished_image_001.tif",
      ),
    ).toBeLessThanOrEqual(260);
  });

  it("throws with the total length when the path exceeds MAX_PATH", () => {
    const expectedTotal = joinUncPath(
      backupRoot,
      "VERYLONGCLIENTFOLDER",
      `VRLY_260726_001__${"a".repeat(120)}`,
      "01_INITIAL",
      `${"b".repeat(100)}.tif`,
    ).length;

    expect(() =>
      assertPathBudget(
        backupRoot,
        ["VERYLONGCLIENTFOLDER", `VRLY_260726_001__${"a".repeat(120)}`, "01_INITIAL"],
        `${"b".repeat(100)}.tif`,
      ),
    ).toThrow(new PathBudgetError(expectedTotal, 260));
  });
});
