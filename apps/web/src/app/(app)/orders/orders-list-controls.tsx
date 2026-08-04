import Link from "next/link";
import { ORDER_STATUS_FILTERS, type OrderStatusFilterId } from "@/app/(app)/orders/order-status";

function buildOrdersHref(input: { status: OrderStatusFilterId; q: string }): string {
  const params = new URLSearchParams();
  if (input.status !== "all") params.set("status", input.status);
  if (input.q.trim()) params.set("q", input.q.trim());
  const query = params.toString();
  return query ? `/orders?${query}` : "/orders";
}

export function OrdersListControls({ status, q }: { status: OrderStatusFilterId; q: string }) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by status">
        {ORDER_STATUS_FILTERS.map((filter) => {
          const active = filter.id === status;
          return (
            <Link
              key={filter.id}
              href={buildOrdersHref({ status: filter.id, q })}
              className={
                active
                  ? "rounded-full bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white"
                  : "rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              }
              aria-current={active ? "page" : undefined}
            >
              {filter.label}
            </Link>
          );
        })}
      </div>
      <form method="get" action="/orders" className="flex flex-wrap gap-2">
        {status !== "all" ? <input type="hidden" name="status" value={status} /> : null}
        <label className="sr-only" htmlFor="orders-search">
          Search orders
        </label>
        <input
          id="orders-search"
          name="q"
          type="search"
          defaultValue={q}
          placeholder="Search code, title, or client"
          className="min-w-[16rem] flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
        />
        <button
          type="submit"
          className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50"
        >
          Search
        </button>
        {q || status !== "all" ? (
          <Link
            href="/orders"
            className="rounded-lg px-3 py-2 text-sm font-semibold text-indigo-700 hover:text-indigo-900"
          >
            Clear
          </Link>
        ) : null}
      </form>
    </div>
  );
}
