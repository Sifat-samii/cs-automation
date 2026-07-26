import { prisma } from "@cs/db";
import Link from "next/link";
import { requireUser } from "@/lib/auth/current-user";
import { assertCan, can } from "@/lib/auth/rbac";
import {
  IN_PRODUCTION_ORDER_STATUSES,
  PAST_ORDER_STATUSES,
  UNASSIGNED_ORDER_STATUSES,
} from "@/lib/clients/buckets";

export default async function ClientsPage() {
  const user = await requireUser();
  assertCan(user.role, "client:read");
  const canManage = can(user.role, "client:manage");

  const clients = await prisma.client.findMany({
    orderBy: { displayName: "asc" },
    include: {
      identities: { orderBy: [{ kind: "asc" }, { value: "asc" }] },
      orders: { select: { status: true } },
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-indigo-600">
            Registry
          </p>
          <h1 className="mt-1 text-2xl font-bold text-slate-950">Clients</h1>
          <p className="mt-1 text-sm text-slate-600">
            Client codes, folders, and order buckets. Seeded names may need folder rebinding before
            file jobs succeed.
          </p>
        </div>
        {canManage ? (
          <Link
            href="/clients/new"
            className="rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-700"
          >
            New client
          </Link>
        ) : null}
      </div>

      {clients.length === 0 ? (
        <div className="min-h-52 rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center">
          <h2 className="font-semibold text-slate-900">No clients registered</h2>
          <p className="mx-auto mt-2 max-w-lg text-sm text-slate-600">
            Run database seed or register a client. Orders cannot be created until at least one
            active client exists.
          </p>
          {canManage ? (
            <Link
              href="/clients/new"
              className="mt-5 inline-block text-sm font-semibold text-indigo-700 hover:text-indigo-900"
            >
              Register the first client
            </Link>
          ) : null}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3 font-semibold">Code</th>
                <th className="px-4 py-3 font-semibold">Name</th>
                <th className="px-4 py-3 font-semibold">Folder</th>
                <th className="px-4 py-3 font-semibold">Unassigned</th>
                <th className="px-4 py-3 font-semibold">In production</th>
                <th className="px-4 py-3 font-semibold">Past</th>
              </tr>
            </thead>
            <tbody>
              {clients.map((client) => {
                const past = client.orders.filter((order) =>
                  (PAST_ORDER_STATUSES as readonly string[]).includes(order.status),
                ).length;
                const inProduction = client.orders.filter((order) =>
                  (IN_PRODUCTION_ORDER_STATUSES as readonly string[]).includes(order.status),
                ).length;
                const unassigned = client.orders.filter((order) =>
                  (UNASSIGNED_ORDER_STATUSES as readonly string[]).includes(order.status),
                ).length;
                return (
                  <tr key={client.id} className="border-b border-slate-100 last:border-0">
                    <td className="px-4 py-3 font-mono text-xs font-bold text-indigo-700">
                      <Link href={`/clients/${client.id}`} className="hover:underline">
                        {client.code}
                      </Link>
                    </td>
                    <td className="px-4 py-3 font-medium text-slate-950">
                      <Link href={`/clients/${client.id}`} className="hover:underline">
                        {client.displayName}
                      </Link>
                    </td>
                    <td className="px-4 py-3 break-all text-slate-700">{client.folderName}</td>
                    <td className="px-4 py-3 text-slate-800">{unassigned}</td>
                    <td className="px-4 py-3 text-slate-800">{inProduction}</td>
                    <td className="px-4 py-3 text-slate-800">{past}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
