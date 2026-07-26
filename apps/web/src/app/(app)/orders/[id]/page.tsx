import { prisma } from "@cs/db";
import { parseServerEnv, type OrderStatus } from "@cs/shared";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AddBatchForm, EtaForm, OrderStatusForm } from "@/app/(app)/orders/order-controls";
import { TransferMonitor, type TransferJobView } from "@/app/(app)/orders/transfer-monitor";
import { requireUser } from "@/lib/auth/current-user";
import { assertCan } from "@/lib/auth/rbac";

function formatUtc(value: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(value);
}

export default async function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  assertCan(user.role, "order:write");
  const { id } = await params;
  const env = parseServerEnv(process.env);
  const order = await prisma.order.findUnique({
    where: { id },
    include: {
      client: true,
      batches: {
        orderBy: { sequence: "asc" },
        include: {
          sourceLinks: { orderBy: { createdAt: "asc" } },
          transferJobs: { orderBy: { createdAt: "asc" } },
        },
      },
      events: { orderBy: { occurredAt: "asc" } },
    },
  });
  if (!order) notFound();
  const terminal = order.status === "CLOSED" || order.status === "CANCELLED";

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/orders"
          className="text-sm font-semibold text-indigo-700 hover:text-indigo-900"
        >
          ← Back to orders
        </Link>
        <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="font-mono text-sm font-bold tracking-wide text-indigo-700">
              {order.code}
            </p>
            <h1 className="mt-1 text-2xl font-bold text-slate-950">{order.title}</h1>
            <p className="mt-1 text-sm text-slate-600">
              {order.client.displayName} · {order.orderType}
            </p>
          </div>
          <span className="rounded-full bg-slate-900 px-3 py-1.5 text-xs font-bold text-white">
            {order.status.replaceAll("_", " ")}
          </span>
        </div>
      </div>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {[
          ["Quantity", order.quantity?.toString() ?? "Not set"],
          ["ETA", order.eta ? `${formatUtc(order.eta)} UTC` : "Not set"],
          ["Created", `${formatUtc(order.createdAt)} UTC`],
          ["Client code", order.client.code],
        ].map(([label, value]) => (
          <div key={label} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
            <p className="mt-2 text-sm font-semibold text-slate-900">{value}</p>
          </div>
        ))}
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="font-semibold text-slate-950">Recorded paths</h2>
        <dl className="mt-4 space-y-3 text-sm">
          <div>
            <dt className="text-xs text-slate-500">Backup</dt>
            <dd className="mt-1 break-all font-mono text-slate-800">{order.backupPath}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Production</dt>
            <dd className="mt-1 break-all font-mono text-slate-800">{order.productionPath}</dd>
          </div>
        </dl>
      </section>

      {!terminal && (
        <section className="grid gap-4 lg:grid-cols-3">
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="mb-4 font-semibold text-slate-950">Progress order</h2>
            <OrderStatusForm orderId={order.id} status={order.status as OrderStatus} />
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="mb-4 font-semibold text-slate-950">Set ETA</h2>
            <EtaForm orderId={order.id} />
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="mb-4 font-semibold text-slate-950">Add batch</h2>
            <AddBatchForm orderId={order.id} />
          </div>
        </section>
      )}

      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-bold text-slate-950">Batches</h2>
          <p className="text-sm text-slate-600">
            Approved transfers run through staging, backup, production copy, and checksum
            verification.
          </p>
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          {order.batches.map((batch) => (
            <article
              key={batch.id}
              className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-mono text-xs font-bold text-indigo-700">{batch.subfolder}</p>
                  <h3 className="mt-1 font-semibold text-slate-950">{batch.kind}</h3>
                </div>
                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
                  {batch.status.replaceAll("_", " ")}
                </span>
              </div>
              {batch.notes && <p className="mt-3 text-sm text-slate-700">{batch.notes}</p>}
              {batch.failureReason && (
                <p className="mt-3 text-sm text-red-700">Failure: {batch.failureReason}</p>
              )}
              <div className="mt-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Source links
                </p>
                {batch.sourceLinks.length === 0 ? (
                  <p className="mt-2 text-sm text-slate-500">No source recorded.</p>
                ) : (
                  <ul className="mt-2 space-y-2 text-sm">
                    {batch.sourceLinks.map((source) => (
                      <li key={source.id} className="break-all text-slate-700">
                        <span className="mr-2 text-xs font-semibold text-slate-500">
                          {source.kind}
                        </span>
                        {source.url ? (
                          <a
                            href={source.url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-indigo-700 underline"
                          >
                            {source.url}
                          </a>
                        ) : (
                          source.localHint
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <TransferMonitor
                orderId={order.id}
                batchId={batch.id}
                batchStatus={batch.status}
                manualDropPath={`${env.STAGING_ROOT}\\manual\\${batch.id}`}
                jobs={batch.transferJobs.map((job): TransferJobView => ({
                  id: job.id,
                  kind: job.kind,
                  status: job.status,
                  attempts: job.attempts,
                  maxAttempts: job.maxAttempts,
                  bytesDone: Number(job.bytesDone),
                  bytesTotal: Number(job.bytesTotal),
                  lastError: job.lastError,
                  errorClass: job.errorClass,
                }))}
              />
            </article>
          ))}
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-bold text-slate-950">Order timeline</h2>
        {order.events.length === 0 ? (
          <p className="mt-4 text-sm text-slate-500">No timeline events have been recorded.</p>
        ) : (
          <ol className="mt-5 space-y-5 border-l border-slate-200 pl-5">
            {order.events.map((event) => (
              <li key={event.id} className="relative">
                <span className="absolute -left-[1.56rem] top-1 h-2.5 w-2.5 rounded-full bg-indigo-600" />
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="font-semibold text-slate-900">{event.type.replaceAll(".", " ")}</p>
                  <time className="text-xs text-slate-500">{formatUtc(event.occurredAt)} UTC</time>
                </div>
                <p className="mt-1 text-sm text-slate-600">By {event.actorLabel}</p>
                <code className="mt-2 block break-all rounded bg-slate-50 px-3 py-2 text-xs text-slate-600">
                  {JSON.stringify(event.payload)}
                </code>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
