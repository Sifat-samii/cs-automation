import { prisma } from "@cs/db";
import { joinUncPath, parseServerEnv } from "@cs/shared";
import Link from "next/link";
import { ClientsTable, type ClientTableRow } from "@/app/(app)/clients/clients-table";
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
  const env = parseServerEnv(process.env);

  const clients = await prisma.client.findMany({
    orderBy: { displayName: "asc" },
    include: {
      orders: {
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          title: true,
          createdAt: true,
          eta: true,
          status: true,
          quantity: true,
          backupPath: true,
        },
      },
    },
  });

  const rows: ClientTableRow[] = clients.map((client) => {
    const past = client.orders.filter((order) =>
      (PAST_ORDER_STATUSES as readonly string[]).includes(order.status),
    ).length;
    const inProduction = client.orders.filter((order) =>
      (IN_PRODUCTION_ORDER_STATUSES as readonly string[]).includes(order.status),
    ).length;
    const unassigned = client.orders.filter((order) =>
      (UNASSIGNED_ORDER_STATUSES as readonly string[]).includes(order.status),
    ).length;
    return {
      id: client.id,
      code: client.code,
      displayName: client.displayName,
      folderName: client.folderName,
      folderPath: joinUncPath(env.BACKUP_ROOT_UNC, client.folderName),
      unassigned,
      inProduction,
      past,
      orders: client.orders.map((order) => ({
        id: order.id,
        title: order.title,
        createdAt: order.createdAt.toISOString(),
        eta: order.eta ? order.eta.toISOString() : null,
        status: order.status,
        quantity: order.quantity,
        backupPath: order.backupPath,
      })),
    };
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
            Click a row to view orders. Folder paths are on the backup share; copy them when needed.
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

      {rows.length === 0 ? (
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
        <ClientsTable clients={rows} />
      )}
    </div>
  );
}
