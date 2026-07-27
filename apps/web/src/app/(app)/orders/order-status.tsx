import type { OrderStatus } from "@cs/shared/lifecycle";

export type OrderStatusFilterId = "all" | "unassigned" | "in_production" | "ready_to_upload";

export const ORDER_STATUS_FILTERS: readonly {
  id: OrderStatusFilterId;
  label: string;
  statuses: readonly OrderStatus[] | null;
}[] = [
  { id: "all", label: "All", statuses: null },
  { id: "unassigned", label: "Unassigned", statuses: ["UNASSIGNED"] },
  { id: "in_production", label: "In production", statuses: ["IN_PRODUCTION"] },
  { id: "ready_to_upload", label: "Ready to upload", statuses: ["READY_TO_UPLOAD"] },
] as const;

export type EtaTag = "ETA Required" | "ETA Sent";

export function etaTagFor(order: {
  status: string;
  etaSentAt: Date | string | null | undefined;
}): EtaTag | null {
  if (order.etaSentAt) return "ETA Sent";
  if (order.status === "IN_PRODUCTION") return "ETA Required";
  return null;
}

export function parseOrderStatusFilter(raw: string | undefined | null): OrderStatusFilterId {
  const value = raw?.trim().toLowerCase() ?? "all";
  const match = ORDER_STATUS_FILTERS.find((filter) => filter.id === value);
  return match?.id ?? "all";
}

export function statusesForFilter(filterId: OrderStatusFilterId): readonly OrderStatus[] | null {
  return ORDER_STATUS_FILTERS.find((filter) => filter.id === filterId)?.statuses ?? null;
}

export function orderStatusBadgeClass(status: string): string {
  switch (status) {
    case "UNASSIGNED":
      return "bg-amber-100 text-amber-950";
    case "IN_PRODUCTION":
      return "bg-indigo-700 text-white";
    case "READY_TO_UPLOAD":
      return "bg-emerald-100 text-emerald-900";
    default:
      return "bg-slate-100 text-slate-700";
  }
}

export function formatOrderStatusLabel(status: string): string {
  return status.replaceAll("_", " ");
}

export function humanizeOrderEventType(type: string): string {
  return type
    .split(".")
    .map((part) => part.replaceAll("_", " "))
    .join(" · ");
}

export function OrderStatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${orderStatusBadgeClass(status)}`}
    >
      {formatOrderStatusLabel(status)}
    </span>
  );
}

export function EtaTagBadge({ tag }: { tag: EtaTag }) {
  const className =
    tag === "ETA Sent"
      ? "bg-emerald-50 text-emerald-900 ring-1 ring-emerald-200"
      : "bg-amber-50 text-amber-950 ring-1 ring-amber-200";
  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${className}`}>
      {tag}
    </span>
  );
}
