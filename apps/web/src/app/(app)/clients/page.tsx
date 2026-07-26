import { prisma } from "@cs/db";
import Link from "next/link";
import { requireUser } from "@/lib/auth/current-user";
import { assertCan } from "@/lib/auth/rbac";

export default async function ClientsPage() {
  const user = await requireUser();
  assertCan(user.role, "client:manage");
  const clients = await prisma.client.findMany({
    orderBy: { displayName: "asc" },
    include: {
      identities: { orderBy: [{ kind: "asc" }, { value: "asc" }] },
      _count: { select: { orders: true } },
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
            Bind approved share folders and sender identities to canonical client codes.
          </p>
        </div>
        <Link
          href="/clients/new"
          className="rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-700"
        >
          New client
        </Link>
      </div>

      {clients.length === 0 ? (
        <div className="min-h-52 rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center">
          <h2 className="font-semibold text-slate-900">No clients registered</h2>
          <p className="mx-auto mt-2 max-w-lg text-sm text-slate-600">
            Start by binding an existing backup folder. Orders cannot be created until at least one
            active client exists.
          </p>
          <Link
            href="/clients/new"
            className="mt-5 inline-block text-sm font-semibold text-indigo-700 hover:text-indigo-900"
          >
            Register the first client
          </Link>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {clients.map((client) => (
            <article
              key={client.id}
              className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="font-mono text-xs font-bold tracking-wider text-indigo-700">
                    {client.code}
                  </p>
                  <h2 className="mt-1 text-lg font-semibold text-slate-950">
                    {client.displayName}
                  </h2>
                </div>
                <span
                  className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                    client.isActive
                      ? "bg-emerald-100 text-emerald-800"
                      : "bg-slate-100 text-slate-600"
                  }`}
                >
                  {client.isActive ? "Active" : "Inactive"}
                </span>
              </div>
              <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-xs text-slate-500">Backup folder</dt>
                  <dd className="mt-1 break-all font-medium text-slate-800">{client.folderName}</dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-500">Orders</dt>
                  <dd className="mt-1 font-medium text-slate-800">{client._count.orders}</dd>
                </div>
              </dl>
              <div className="mt-4 border-t border-slate-100 pt-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Sender identities
                </p>
                {client.identities.length === 0 ? (
                  <p className="mt-2 text-sm text-slate-500">No sender matching configured.</p>
                ) : (
                  <ul className="mt-2 space-y-1">
                    {client.identities.map((identity) => (
                      <li key={identity.id} className="break-all text-sm text-slate-700">
                        <span className="mr-2 text-xs font-semibold text-slate-500">
                          {identity.kind}
                        </span>
                        {identity.value}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
