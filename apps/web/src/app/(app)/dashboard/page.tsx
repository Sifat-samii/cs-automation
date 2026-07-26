import { prisma } from "@cs/db";
import Link from "next/link";
import { requireUser } from "@/lib/auth/current-user";
import { can } from "@/lib/auth/rbac";

export default async function DashboardPage() {
  const user = await requireUser();
  const [orderCount, activeClientCount, openOrderCount] = await Promise.all([
    prisma.order.count(),
    prisma.client.count({ where: { isActive: true } }),
    prisma.order.count({
      where: { status: { notIn: ["CLOSED", "CANCELLED"] } },
    }),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-indigo-600">
          Operations
        </p>
        <h1 className="mt-1 text-2xl font-bold text-slate-950">Dashboard</h1>
        <p className="mt-1 text-sm text-slate-600">Signed in with staff ID {user.loginId}.</p>
      </div>

      <section className="grid gap-4 sm:grid-cols-3">
        {[
          ["All orders", orderCount],
          ["Open orders", openOrderCount],
          ["Active clients", activeClientCount],
        ].map(([label, value]) => (
          <div key={label} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm font-medium text-slate-600">{label}</p>
            <p className="mt-2 text-3xl font-bold text-slate-950">{value}</p>
          </div>
        ))}
      </section>

      <div className="grid gap-4 md:grid-cols-2">
        <Link
          href="/orders"
          className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm transition hover:border-indigo-300"
        >
          <p className="text-xs font-semibold uppercase tracking-wide text-indigo-600">
            Manual intake
          </p>
          <h2 className="mt-2 font-bold text-slate-950">Open order workspace</h2>
          <p className="mt-2 text-sm text-slate-600">
            Create orders, add batches, set ETA, and progress lifecycle status.
          </p>
        </Link>
        {can(user.role, "client:read") && (
          <Link
            href="/clients"
            className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm transition hover:border-indigo-300"
          >
            <p className="text-xs font-semibold uppercase tracking-wide text-indigo-600">
              Lead controls
            </p>
            <h2 className="mt-2 font-bold text-slate-950">Manage client registry</h2>
            <p className="mt-2 text-sm text-slate-600">
              Bind existing folders and configure sender identity matching.
            </p>
          </Link>
        )}
      </div>
    </div>
  );
}
