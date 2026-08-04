export const ORDER_STATUSES = ["UNASSIGNED", "IN_PRODUCTION", "READY_TO_UPLOAD"] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const BATCH_STATUSES = [
  "PENDING",
  "DOWNLOADING",
  "STAGED",
  "WRITTEN_BACKUP",
  "COPIED_PRODUCTION",
  "VERIFIED",
  "FAILED",
  "CANCELLED",
] as const;

export type BatchStatus = (typeof BATCH_STATUSES)[number];

export class IllegalTransitionError extends Error {
  readonly lifecycle: "order" | "batch";
  readonly from: string;
  readonly to: string;

  constructor(lifecycle: "order" | "batch", from: string, to: string) {
    super(`Illegal ${lifecycle} transition from ${from} to ${to}`);
    this.name = "IllegalTransitionError";
    this.lifecycle = lifecycle;
    this.from = from;
    this.to = to;
  }
}

const ORDER_TRANSITIONS = {
  UNASSIGNED: ["IN_PRODUCTION"],
  IN_PRODUCTION: ["READY_TO_UPLOAD"],
  READY_TO_UPLOAD: [],
} as const satisfies Record<OrderStatus, readonly OrderStatus[]>;

const BATCH_TRANSITIONS = {
  PENDING: ["DOWNLOADING", "FAILED", "CANCELLED"],
  DOWNLOADING: ["STAGED", "FAILED", "CANCELLED"],
  STAGED: ["WRITTEN_BACKUP", "FAILED", "CANCELLED"],
  WRITTEN_BACKUP: ["COPIED_PRODUCTION", "FAILED", "CANCELLED"],
  COPIED_PRODUCTION: ["VERIFIED", "FAILED", "CANCELLED"],
  VERIFIED: [],
  FAILED: ["PENDING", "CANCELLED"],
  CANCELLED: [],
} as const satisfies Record<BatchStatus, readonly BatchStatus[]>;

export function orderTransition(from: OrderStatus, to: OrderStatus): boolean {
  return (ORDER_TRANSITIONS[from] as readonly OrderStatus[]).includes(to);
}

export function batchTransition(from: BatchStatus, to: BatchStatus): boolean {
  return (BATCH_TRANSITIONS[from] as readonly BatchStatus[]).includes(to);
}

export function assertOrderTransition(from: OrderStatus, to: OrderStatus): void {
  if (!orderTransition(from, to)) {
    throw new IllegalTransitionError("order", from, to);
  }
}

export function assertBatchTransition(from: BatchStatus, to: BatchStatus): void {
  if (!batchTransition(from, to)) {
    throw new IllegalTransitionError("batch", from, to);
  }
}
