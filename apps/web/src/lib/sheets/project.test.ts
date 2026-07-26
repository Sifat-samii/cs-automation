import { describe, expect, it } from "vitest";
import {
  formatSheetDate,
  projectOrderToSheetRow,
  SHEET_ORDER_NAME_KEY,
  SHEET_WRITE_HEADERS,
  sheetRowValues,
} from "@/lib/sheets/project";

describe("projectOrderToSheetRow", () => {
  it("maps only the four writable layout columns plus reconcile metadata", () => {
    const payload = projectOrderToSheetRow({
      title: "FN 02-20-26_Zea",
      quantity: 210,
      createdAt: new Date("2026-02-23T15:00:00.000Z"),
      clientDisplayName: "FN",
      orderCode: "FN-20260223-001",
      clientId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    });

    expect(payload).toEqual({
      Date: "23/02/2026",
      Client: "FN",
      "Order Name": "FN 02-20-26_Zea",
      Quantity: "210",
      orderCode: "FN-20260223-001",
      placementGroup: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa:23/02/2026",
    });
    expect(SHEET_ORDER_NAME_KEY).toBe("Order Name");
    expect(SHEET_WRITE_HEADERS).toEqual(["Date", "Client", "Order Name", "Quantity"]);
    expect(sheetRowValues(payload)).toEqual({
      Date: "23/02/2026",
      Client: "FN",
      "Order Name": "FN 02-20-26_Zea",
      Quantity: "210",
    });
  });

  it("uses an empty Quantity string when quantity is null", () => {
    const payload = projectOrderToSheetRow({
      title: "Yeti Royal Blue Soft Coolers",
      quantity: null,
      createdAt: new Date("2026-02-21T00:00:00.000Z"),
      clientDisplayName: "Yeti",
      orderCode: "YETI-20260221-001",
      clientId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    });
    expect(payload.Quantity).toBe("");
    expect(formatSheetDate(new Date("2026-02-21T23:59:59.000Z"))).toBe("21/02/2026");
  });
});
