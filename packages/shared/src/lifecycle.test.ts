import { describe, expect, it } from "vitest";
import {
  BATCH_STATUSES,
  ORDER_STATUSES,
  IllegalTransitionError,
  assertBatchTransition,
  assertOrderTransition,
  batchTransition,
  orderTransition,
} from "./lifecycle.js";
import type { BatchStatus, OrderStatus } from "./lifecycle.js";

const legalOrderTransitions = [
  ["UNASSIGNED", "IN_PRODUCTION"],
  ["IN_PRODUCTION", "READY_TO_UPLOAD"],
] as const satisfies readonly (readonly [OrderStatus, OrderStatus])[];

const legalBatchTransitions = [
  ["PENDING", "DOWNLOADING"],
  ["PENDING", "FAILED"],
  ["PENDING", "CANCELLED"],
  ["DOWNLOADING", "STAGED"],
  ["DOWNLOADING", "FAILED"],
  ["DOWNLOADING", "CANCELLED"],
  ["STAGED", "WRITTEN_BACKUP"],
  ["STAGED", "FAILED"],
  ["STAGED", "CANCELLED"],
  ["WRITTEN_BACKUP", "COPIED_PRODUCTION"],
  ["WRITTEN_BACKUP", "FAILED"],
  ["WRITTEN_BACKUP", "CANCELLED"],
  ["COPIED_PRODUCTION", "VERIFIED"],
  ["COPIED_PRODUCTION", "FAILED"],
  ["COPIED_PRODUCTION", "CANCELLED"],
  ["FAILED", "PENDING"],
  ["FAILED", "CANCELLED"],
] as const satisfies readonly (readonly [BatchStatus, BatchStatus])[];

describe("order lifecycle", () => {
  it.each(legalOrderTransitions)("%s -> %s is legal", (from, to) => {
    expect(orderTransition(from, to)).toBe(true);
    expect(() => assertOrderTransition(from, to)).not.toThrow();
  });

  it.each([
    ["READY_TO_UPLOAD", "UNASSIGNED"],
    ["READY_TO_UPLOAD", "IN_PRODUCTION"],
    ["UNASSIGNED", "READY_TO_UPLOAD"],
    ["IN_PRODUCTION", "UNASSIGNED"],
  ] as const satisfies readonly (readonly [OrderStatus, OrderStatus])[])(
    "%s -> %s is illegal",
    (from, to) => {
      expect(orderTransition(from, to)).toBe(false);
      expect(() => assertOrderTransition(from, to)).toThrow(IllegalTransitionError);
    },
  );

  it("accepts only the declared legal transitions", () => {
    const expected = new Set(legalOrderTransitions.map(([from, to]) => `${from}:${to}`));
    for (const from of ORDER_STATUSES) {
      for (const to of ORDER_STATUSES) {
        expect(orderTransition(from, to)).toBe(expected.has(`${from}:${to}`));
      }
    }
  });
});

describe("batch lifecycle", () => {
  it.each(legalBatchTransitions)("%s -> %s is legal", (from, to) => {
    expect(batchTransition(from, to)).toBe(true);
    expect(() => assertBatchTransition(from, to)).not.toThrow();
  });

  it.each([
    ["VERIFIED", "DOWNLOADING"],
    ["CANCELLED", "PENDING"],
    ["PENDING", "STAGED"],
    ["FAILED", "DOWNLOADING"],
  ] as const satisfies readonly (readonly [BatchStatus, BatchStatus])[])(
    "%s -> %s is illegal",
    (from, to) => {
      expect(batchTransition(from, to)).toBe(false);
      expect(() => assertBatchTransition(from, to)).toThrow(IllegalTransitionError);
    },
  );

  it("accepts only pipeline, failure, retry, and cancellation transitions", () => {
    const expected = new Set(legalBatchTransitions.map(([from, to]) => `${from}:${to}`));
    for (const from of BATCH_STATUSES) {
      for (const to of BATCH_STATUSES) {
        expect(batchTransition(from, to)).toBe(expected.has(`${from}:${to}`));
      }
    }
  });
});
