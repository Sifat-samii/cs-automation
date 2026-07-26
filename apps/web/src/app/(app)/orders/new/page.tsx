import { prisma } from "@cs/db";
import Link from "next/link";
import { OrderForm } from "@/app/(app)/orders/order-form";
import { requireUser } from "@/lib/auth/current-user";
import { assertCan } from "@/lib/auth/rbac";

function utcDateCode(date: Date): string {
  return [
    date.getUTCFullYear().toString().slice(-2),
    (date.getUTCMonth() + 1).toString().padStart(2, "0"),
    date.getUTCDate().toString().padStart(2, "0"),
  ].join("");
}

export default async function NewOrderPage() {
  const user = await requireUser();
  assertCan(user.role, "order:write");
  const clients = await prisma.client.findMany({
    where: { isActive: true },
    orderBy: { displayName: "asc" },
    select: { id: true, code: true, displayName: true },
  });

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link
          href="/orders"
          className="text-sm font-semibold text-indigo-700 hover:text-indigo-900"
        >
          ← Back to orders
        </Link>
        <h1 className="mt-3 text-2xl font-bold text-slate-950">Create manual order</h1>
        <p className="mt-1 text-sm text-slate-600">
          The initial batch and both audited timelines are created with the order.
        </p>
      </div>
      {clients.length === 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          No active clients are available. Ask a CS lead to register a client before creating an
          order.
        </div>
      )}
      <OrderForm clients={clients} utcDateCode={utcDateCode(new Date())} />
    </div>
  );
}
