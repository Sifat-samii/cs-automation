import { prisma } from "@cs/db";
import type { Prisma } from "@cs/db";
import Link from "next/link";
import { OrdersListControls } from "@/app/(app)/orders/orders-list-controls";
import {
  EtaTagBadge,
  OrderStatusBadge,
  etaTagFor,
  parseOrderStatusFilter,
  statusesForFilter,
} from "@/app/(app)/orders/order-status";
import { TimeRemaining } from "@/app/(app)/orders/time-remaining";
import { requireUser } from "@/lib/auth/current-user";
import { assertCan } from "@/lib/auth/rbac";

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string }>;
}) {
  const user = await requireUser();
  assertCan(user.role, "order:write");
  const params = await searchParams;
  const q = params.q?.trim() ?? "";
  const statusFilter = parseOrderStatusFilter(params.status);
  const statuses = statusesForFilter(statusFilter);

  const where: Prisma.OrderWhereInput = {
    ...(statuses ? { status: { in: [...statuses] } } : {}),
    ...(q
      ? {
          OR: [
            { code: { contains: q, mode: "insensitive" } },
            { title: { contains: q, mode: "insensitive" } },
            { client: { displayName: { contains: q, mode: "insensitive" } } },
          ],
        }
      : {}),
  };

  const [totalCount, orders] = await Promise.all([
    prisma.order.count(),
    prisma.order.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        client: true,
        _count: { select: { batches: true } },
      },
    }),
  ]);

  const filtersActive = statusFilter !== "all" || q.length > 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-indigo-600">
            Client support
          </p>
          <h1 className="mt-1 text-2xl font-bold text-slate-950">Orders</h1>
          <p className="mt-1 text-sm text-slate-600">
            Unassigned orders await approval. In production work shows ETA tags and time remaining.
          </p>
        </div>
        <Link
          href="/orders/new"
          className="rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-700"
        >
          New order
        </Link>
      </div>

      {totalCount > 0 ? <OrdersListControls status={statusFilter} q={q} /> : null}

      {totalCount === 0 ? (
        <div className="min-h-52 rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center">
          <h2 className="font-semibold text-slate-900">No orders yet</h2>
          <p className="mx-auto mt-2 max-w-lg text-sm text-slate-600">
            Orders appear here after an order email is ingested, or when created manually.
          </p>
          <Link
            href="/orders/new"
            className="mt-5 inline-block text-sm font-semibold text-indigo-700 hover:text-indigo-900"
          >
            Create an order
          </Link>
        </div>
      ) : orders.length === 0 ? (
        <div className="min-h-40 rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center">
          <h2 className="font-semibold text-slate-900">No matching orders</h2>
          <p className="mx-auto mt-2 max-w-lg text-sm text-slate-600">
            Nothing matches the current status filter or search. Clear filters to see all orders.
          </p>
          <Link
            href="/orders"
            className="mt-4 inline-block text-sm font-semibold text-indigo-700 hover:text-indigo-900"
          >
            Clear filters
          </Link>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3 text-xs text-slate-500">
            <span>
              Showing {orders.length}
              {filtersActive ? ` of ${totalCount}` : ""} order{orders.length === 1 ? "" : "s"}
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-5 py-3 font-semibold">Order</th>
                  <th className="px-5 py-3 font-semibold">Client</th>
                  <th className="px-5 py-3 font-semibold">Status</th>
                  <th className="px-5 py-3 font-semibold">ETA tag</th>
                  <th className="px-5 py-3 font-semibold">Time remaining</th>
                  <th className="px-5 py-3 font-semibold">Batches</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {orders.map((order) => {
                  const tag = etaTagFor({ status: order.status, etaSentAt: order.etaSentAt });
                  return (
                    <tr key={order.id} className="hover:bg-slate-50">
                      <td className="px-5 py-4">
                        <Link
                          href={`/orders/${order.id}`}
                          className="font-semibold text-slate-950 hover:text-indigo-800"
                        >
                          {order.title}
                        </Link>
                        <p className="mt-1 font-mono text-xs font-medium tracking-wide text-indigo-700">
                          {order.code}
                        </p>
                        {order.communicationPaused ? (
                          <p className="mt-1 text-xs font-semibold text-rose-700">Paused</p>
                        ) : null}
                      </td>
                      <td className="px-5 py-4 text-slate-700">{order.client.displayName}</td>
                      <td className="px-5 py-4">
                        <OrderStatusBadge status={order.status} />
                      </td>
                      <td className="px-5 py-4">
                        {tag ? (
                          <EtaTagBadge tag={tag} />
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="px-5 py-4">
                        <TimeRemaining etaIso={order.eta?.toISOString() ?? null} />
                      </td>
                      <td className="px-5 py-4 text-slate-700">{order._count.batches}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
