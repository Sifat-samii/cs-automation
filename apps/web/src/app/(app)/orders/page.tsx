import { prisma } from "@cs/db";
import Link from "next/link";
import { requireUser } from "@/lib/auth/current-user";
import { assertCan } from "@/lib/auth/rbac";

function formatUtc(value: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(value);
}

export default async function OrdersPage() {
  const user = await requireUser();
  assertCan(user.role, "order:write");
  const orders = await prisma.order.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      client: true,
      _count: { select: { batches: true } },
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-indigo-600">
            Manual intake
          </p>
          <h1 className="mt-1 text-2xl font-bold text-slate-950">Orders</h1>
          <p className="mt-1 text-sm text-slate-600">
            Create and progress orders while keeping each operational step in the timeline.
          </p>
        </div>
        <Link
          href="/orders/new"
          className="rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-700"
        >
          New order
        </Link>
      </div>

      {orders.length === 0 ? (
        <div className="min-h-52 rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center">
          <h2 className="font-semibold text-slate-900">No orders yet</h2>
          <p className="mx-auto mt-2 max-w-lg text-sm text-slate-600">
            Create the first manual order after a lead has registered its client and folder binding.
          </p>
          <Link
            href="/orders/new"
            className="mt-5 inline-block text-sm font-semibold text-indigo-700 hover:text-indigo-900"
          >
            Create an order
          </Link>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-5 py-3 font-semibold">Order</th>
                  <th className="px-5 py-3 font-semibold">Client</th>
                  <th className="px-5 py-3 font-semibold">Status</th>
                  <th className="px-5 py-3 font-semibold">ETA</th>
                  <th className="px-5 py-3 font-semibold">Batches</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {orders.map((order) => (
                  <tr key={order.id} className="hover:bg-slate-50">
                    <td className="px-5 py-4">
                      <Link
                        href={`/orders/${order.id}`}
                        className="font-semibold text-indigo-700 hover:text-indigo-900"
                      >
                        {order.code}
                      </Link>
                      <p className="mt-1 max-w-xs truncate text-slate-600">{order.title}</p>
                    </td>
                    <td className="px-5 py-4 text-slate-700">{order.client.displayName}</td>
                    <td className="px-5 py-4">
                      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
                        {order.status.replaceAll("_", " ")}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-slate-600">
                      {order.eta ? `${formatUtc(order.eta)} UTC` : "Not set"}
                    </td>
                    <td className="px-5 py-4 text-slate-700">{order._count.batches}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
