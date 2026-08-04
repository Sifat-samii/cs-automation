import { describe, expect, it } from "vitest";
import {
  etaTagFor,
  humanizeOrderEventType,
  orderStatusBadgeClass,
  parseOrderStatusFilter,
  statusesForFilter,
} from "@/app/(app)/orders/order-status";

describe("order status helpers", () => {
  it("parses known status filters and defaults unknown values to all", () => {
    expect(parseOrderStatusFilter("in_production")).toBe("in_production");
    expect(parseOrderStatusFilter("unassigned")).toBe("unassigned");
    expect(parseOrderStatusFilter("ready_to_upload")).toBe("ready_to_upload");
    expect(parseOrderStatusFilter("CLOSED")).toBe("all");
    expect(parseOrderStatusFilter("nope")).toBe("all");
    expect(parseOrderStatusFilter(undefined)).toBe("all");
  });

  it("maps filters to the three-status model", () => {
    expect(statusesForFilter("unassigned")).toEqual(["UNASSIGNED"]);
    expect(statusesForFilter("in_production")).toEqual(["IN_PRODUCTION"]);
    expect(statusesForFilter("ready_to_upload")).toEqual(["READY_TO_UPLOAD"]);
    expect(statusesForFilter("all")).toBeNull();
  });

  it("returns distinct badge classes for lifecycle stages", () => {
    expect(orderStatusBadgeClass("UNASSIGNED")).toContain("amber");
    expect(orderStatusBadgeClass("IN_PRODUCTION")).toContain("indigo-700");
    expect(orderStatusBadgeClass("READY_TO_UPLOAD")).toContain("emerald");
  });

  it("derives ETA tags from production status and etaSentAt", () => {
    expect(etaTagFor({ status: "UNASSIGNED", etaSentAt: null })).toBeNull();
    expect(etaTagFor({ status: "IN_PRODUCTION", etaSentAt: null })).toBe("ETA Required");
    expect(
      etaTagFor({ status: "IN_PRODUCTION", etaSentAt: new Date("2026-08-01T00:00:00.000Z") }),
    ).toBe("ETA Sent");
  });

  it("humanizes event types for timeline display", () => {
    expect(humanizeOrderEventType("order.status_changed")).toBe("order · status changed");
    expect(humanizeOrderEventType("transfer.download.completed")).toBe(
      "transfer · download · completed",
    );
  });
});
