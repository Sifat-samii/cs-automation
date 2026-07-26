import { prisma } from "@cs/db";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/current-user";
import { assertCan } from "@/lib/auth/rbac";
import {
  IN_PRODUCTION_ORDER_STATUSES,
  PAST_ORDER_STATUSES,
  UNASSIGNED_ORDER_STATUSES,
} from "@/lib/clients/buckets";

export default async function ClientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  assertCan(user.role, "client:read");
  const { id } = await params;

  const client = await prisma.client.findUnique({
    where: { id },
    include: {
      identities: { orderBy: [{ kind: "asc" }, { value: "asc" }] },
      orders: {
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          code: true,
          title: true,
          status: true,
          createdAt: true,
        },
      },
    },
  });
  if (!client) notFound();

  const past = client.orders.filter((order) =>
    (PAST_ORDER_STATUSES as readonly string[]).includes(order.status),
  );
  const inProduction = client.orders.filter((order) =>
    (IN_PRODUCTION_ORDER_STATUSES as readonly string[]).includes(order.status),
  );
  const unassigned = client.orders.filter((order) =>
    (UNASSIGNED_ORDER_STATUSES as readonly string[]).includes(order.status),
  );

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/clients"
          className="text-sm font-semibold text-indigo-700 hover:text-indigo-900"
        >
          ← Back to clients
        </Link>
        <p className="mt-3 font-mono text-xs font-bold tracking-wider text-indigo-700">
          {client.code}
        </p>
        <h1 className="mt-1 text-2xl font-bold text-slate-950">{client.displayName}</h1>
        <p className="mt-1 text-sm text-slate-600">
          Folder <span className="font-medium text-slate-800">{client.folderName}</span>
          {" · "}
          {client.isActive ? "Active" : "Inactive"}
        </p>
      </div>

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Sender identities
        </h2>
        {client.identities.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">
            No sender matching configured. Add an address from inbox or the new-client form.
          </p>
        ) : (
          <ul className="mt-3 space-y-1">
            {client.identities.map((identity) => (
              <li key={identity.id} className="break-all text-sm text-slate-700">
                <span className="mr-2 text-xs font-semibold text-slate-500">{identity.kind}</span>
                {identity.value}
              </li>
            ))}
          </ul>
        )}
      </section>

      <OrderBucketSection title="Unassigned (pre-production)" orders={unassigned} empty="None" />
      <OrderBucketSection title="In production" orders={inProduction} empty="None" />
      <OrderBucketSection title="Past" orders={past} empty="None" />
    </div>
  );
}

function OrderBucketSection({
  title,
  orders,
  empty,
}: {
  title: string;
  orders: readonly {
    id: string;
    code: string;
    title: string;
    status: string;
    createdAt: Date;
  }[];
  empty: string;
}) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
        {title} ({orders.length})
      </h2>
      {orders.length === 0 ? (
        <p className="mt-3 text-sm text-slate-500">{empty}</p>
      ) : (
        <ul className="mt-3 divide-y divide-slate-100">
          {orders.map((order) => (
            <li key={order.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
              <div>
                <Link
                  href={`/orders/${order.id}`}
                  className="font-mono text-sm font-semibold text-indigo-700 hover:underline"
                >
                  {order.code}
                </Link>
                <p className="text-sm text-slate-800">{order.title}</p>
              </div>
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
                {order.status}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
