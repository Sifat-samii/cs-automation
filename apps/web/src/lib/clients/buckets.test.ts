import { describe, expect, it } from "vitest";
import {
  bucketForOrderStatus,
  IN_PRODUCTION_ORDER_STATUSES,
  PAST_ORDER_STATUSES,
  UNASSIGNED_ORDER_STATUSES,
} from "./buckets";

describe("bucketForOrderStatus", () => {
  it("maps past, in-production, and unassigned statuses", () => {
    for (const status of PAST_ORDER_STATUSES) {
      expect(bucketForOrderStatus(status)).toBe("past");
    }
    for (const status of IN_PRODUCTION_ORDER_STATUSES) {
      expect(bucketForOrderStatus(status)).toBe("inProduction");
    }
    for (const status of UNASSIGNED_ORDER_STATUSES) {
      expect(bucketForOrderStatus(status)).toBe("unassigned");
    }
  });
});
