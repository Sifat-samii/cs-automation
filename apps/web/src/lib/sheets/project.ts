/** Exact writable headers from docs/integrations/google-sheet-layout.md */
export const SHEET_WRITE_HEADERS = ["Date", "Client", "Order Name", "Quantity"] as const;

export type SheetWriteHeader = (typeof SHEET_WRITE_HEADERS)[number];

/** Lookup column for update-or-append (no order-code column on the live sheet). */
export const SHEET_ORDER_NAME_KEY = "Order Name" as const;

export type SheetOrderProjectionInput = {
  title: string;
  quantity: number | null;
  createdAt: Date;
  clientDisplayName: string;
  orderCode: string;
  clientId: string;
};

export type SheetMirrorPayload = {
  Date: string;
  Client: string;
  "Order Name": string;
  Quantity: string;
  orderCode: string;
  placementGroup: string;
};

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

/** Format a UTC calendar date as DD/MM/YYYY to match the live sheet. */
export function formatSheetDate(date: Date): string {
  return `${pad2(date.getUTCDate())}/${pad2(date.getUTCMonth() + 1)}/${date.getUTCFullYear()}`;
}

export function projectOrderToSheetRow(order: SheetOrderProjectionInput): SheetMirrorPayload {
  const date = formatSheetDate(order.createdAt);
  const orderName = order.title.trim();
  const client = order.clientDisplayName.trim();
  return {
    Date: date,
    Client: client,
    "Order Name": orderName,
    Quantity: order.quantity === null || order.quantity === undefined ? "" : String(order.quantity),
    orderCode: order.orderCode,
    placementGroup: `${order.clientId}:${date}`,
  };
}

export function sheetRowValues(payload: SheetMirrorPayload): Record<SheetWriteHeader, string> {
  return {
    Date: payload.Date,
    Client: payload.Client,
    "Order Name": payload["Order Name"],
    Quantity: payload.Quantity,
  };
}
