import type { OrderStatus } from "@cs/shared";

export const PAST_ORDER_STATUSES = ["READY_TO_UPLOAD"] as const;
export const IN_PRODUCTION_ORDER_STATUSES = ["IN_PRODUCTION"] as const;
export const UNASSIGNED_ORDER_STATUSES = ["UNASSIGNED"] as const;

export type OrderBucket = "past" | "inProduction" | "unassigned";

const PAST = new Set<string>(PAST_ORDER_STATUSES);
const IN_PRODUCTION = new Set<string>(IN_PRODUCTION_ORDER_STATUSES);
const UNASSIGNED = new Set<string>(UNASSIGNED_ORDER_STATUSES);

export function bucketForOrderStatus(status: OrderStatus): OrderBucket {
  if (PAST.has(status)) return "past";
  if (IN_PRODUCTION.has(status)) return "inProduction";
  if (UNASSIGNED.has(status)) return "unassigned";
  throw new Error(`Order status ${status} is not mapped to a client detail bucket`);
}
