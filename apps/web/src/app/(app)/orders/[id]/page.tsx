import { prisma } from "@cs/db";
import { parseServerEnv } from "@cs/shared";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CopyPathButton } from "@/app/(app)/orders/copy-path-button";
import {
  AddBatchForm,
  EditOrderDetailsForm,
  EtaForm,
  PauseResumeForm,
  ReadyToUploadForm,
} from "@/app/(app)/orders/order-controls";
import { OrderDecisionPanel } from "@/app/(app)/orders/order-decision-panel";
import {
  EtaTagBadge,
  OrderStatusBadge,
  etaTagFor,
  humanizeOrderEventType,
} from "@/app/(app)/orders/order-status";
import { OutboundEmailList, type OutboundEmailView } from "@/app/(app)/orders/outbound-email-list";
import { TimeRemaining } from "@/app/(app)/orders/time-remaining";
import { TransferMonitor, type TransferJobView } from "@/app/(app)/orders/transfer-monitor";
import { requireUser } from "@/lib/auth/current-user";
import { assertCan, can } from "@/lib/auth/rbac";

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
  const canReadClients = can(user.role, "client:read");
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
      events: { orderBy: { occurredAt: "desc" } },
      outboundEmails: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!order) notFound();
  const terminal = order.status === "READY_TO_UPLOAD";
  const latestBatch = order.batches.at(-1) ?? null;
  const etaTag = etaTagFor({ status: order.status, etaSentAt: order.etaSentAt });

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
          <div className="min-w-0">
            <h1 className="text-2xl font-bold text-slate-950">{order.title}</h1>
            <p className="mt-1 font-mono text-sm font-bold tracking-wide text-indigo-700">
              {order.code}
            </p>
            <p className="mt-2 text-sm text-slate-600">
              {canReadClients ? (
                <Link
                  href={`/clients/${order.clientId}`}
                  className="font-semibold text-indigo-700 hover:text-indigo-900"
                >
                  {order.client.displayName}
                </Link>
              ) : (
                <span className="font-semibold text-slate-800">{order.client.displayName}</span>
              )}
              <span className="text-slate-400"> · </span>
              {order.orderType}
            </p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <OrderStatusBadge status={order.status} />
            {etaTag ? <EtaTagBadge tag={etaTag} /> : null}
            {order.communicationPaused ? (
              <span className="rounded-full bg-rose-100 px-2.5 py-1 text-xs font-semibold text-rose-800">
                Communication paused
              </span>
            ) : null}
            {order.eta ? (
              <p className="text-xs font-medium text-slate-600">
                ETA {formatUtc(order.eta)} UTC · <TimeRemaining etaIso={order.eta.toISOString()} />
              </p>
            ) : (
              <p className="text-xs text-slate-500">ETA not set</p>
            )}
          </div>
        </div>
      </div>

      <section className="grid gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm sm:grid-cols-2 xl:grid-cols-4">
        {[
          ["Quantity", order.quantity?.toString() ?? "Not set"],
          ["Client code", order.client.code],
          ["Created", `${formatUtc(order.createdAt)} UTC`],
          [
            "Latest batch",
            latestBatch
              ? `${latestBatch.kind.replaceAll("_", " ")} · ${latestBatch.status.replaceAll("_", " ")}`
              : "No batches",
          ],
        ].map(([label, value]) => (
          <div key={label} className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              {label}
            </p>
            <p className="mt-1 truncate text-sm font-semibold text-slate-900">{value}</p>
          </div>
        ))}
      </section>

      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-bold text-slate-950">Batches</h2>
          <p className="text-sm text-slate-600">
            Transfers run through download, staging, backup, production copy, and verification.
          </p>
        </div>
        {order.batches.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-600">
            No batches yet.
          </div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {order.batches.map((batch) => (
              <article
                key={batch.id}
                className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-mono text-xs font-bold text-indigo-700">{batch.subfolder}</p>
                    <h3 className="mt-1 font-semibold text-slate-950">
                      {batch.kind.replaceAll("_", " ")}
                    </h3>
                  </div>
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
                    {batch.status.replaceAll("_", " ")}
                  </span>
                </div>
                {batch.notes && <p className="mt-3 text-sm text-slate-700">{batch.notes}</p>}
                {batch.failureReason && (
                  <p className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                    Failure: {batch.failureReason}
                  </p>
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
                          <span className="mr-2 rounded bg-slate-100 px-1.5 py-0.5 text-xs font-semibold text-slate-600">
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
        )}
      </section>

      {!terminal && (
        <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div>
            <h2 className="font-semibold text-slate-950">Actions</h2>
            <p className="mt-1 text-sm text-slate-600">
              Approve, query, pause communication, set ETA, or mark ready to upload.
            </p>
          </div>

          {order.status === "UNASSIGNED" ? <OrderDecisionPanel orderId={order.id} /> : null}

          <div className="grid gap-6 border-t border-slate-100 pt-4 lg:grid-cols-2 xl:grid-cols-3">
            {order.status === "IN_PRODUCTION" ? (
              <div className="space-y-3">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {order.etaLockedAt ? "Change ETA" : "Set ETA"}
                </h3>
                <EtaForm orderId={order.id} etaLocked={Boolean(order.etaLockedAt)} />
              </div>
            ) : null}
            {order.status === "IN_PRODUCTION" ? (
              <div className="space-y-3">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Ready to upload
                </h3>
                <ReadyToUploadForm orderId={order.id} />
              </div>
            ) : null}
            <div className="space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Communication
              </h3>
              <PauseResumeForm orderId={order.id} paused={order.communicationPaused} />
            </div>
            <div className="space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Add batch
              </h3>
              <AddBatchForm orderId={order.id} />
            </div>
            <details className="space-y-3 lg:col-span-2">
              <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-slate-500">
                Emergency edit details
              </summary>
              <div className="mt-3">
                <EditOrderDetailsForm
                  orderId={order.id}
                  title={order.title}
                  orderType={order.orderType}
                  quantity={order.quantity?.toString() ?? null}
                />
              </div>
            </details>
          </div>
        </section>
      )}

      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-bold text-slate-950">Outbound email</h2>
          <p className="text-sm text-slate-600">
            System-auto-approved client mail history for this order (read-only).
          </p>
        </div>
        <OutboundEmailList
          orderId={order.id}
          outboundEmails={order.outboundEmails.map((outbound): OutboundEmailView => ({
            id: outbound.id,
            template: outbound.template,
            renderedSubject: outbound.renderedSubject,
            renderedBody: outbound.renderedBody,
            status: outbound.status,
            approvedAt: outbound.approvedAt?.toISOString() ?? null,
            sentMessageId: outbound.sentMessageId,
            lastError: outbound.lastError,
          }))}
        />
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="font-semibold text-slate-950">Paths</h2>
        <dl className="mt-4 space-y-3 text-sm">
          <div>
            <div className="flex items-center justify-between gap-2">
              <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Backup
              </dt>
              <CopyPathButton path={order.backupPath} label="backup path" />
            </div>
            <dd className="mt-1 break-all font-mono text-xs text-slate-800">{order.backupPath}</dd>
          </div>
          <div>
            <div className="flex items-center justify-between gap-2">
              <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Production
              </dt>
              <CopyPathButton path={order.productionPath} label="production path" />
            </div>
            <dd className="mt-1 break-all font-mono text-xs text-slate-800">
              {order.productionPath}
            </dd>
          </div>
        </dl>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-bold text-slate-950">Order timeline</h2>
        {order.events.length === 0 ? (
          <p className="mt-4 text-sm text-slate-500">No timeline events have been recorded.</p>
        ) : (
          <ol className="mt-5 space-y-4 border-l border-slate-200 pl-5">
            {order.events.map((event) => (
              <li key={event.id} className="relative">
                <span className="absolute -left-[1.56rem] top-1.5 h-2.5 w-2.5 rounded-full bg-indigo-600" />
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="font-semibold capitalize text-slate-900">
                    {humanizeOrderEventType(event.type)}
                  </p>
                  <time className="text-xs text-slate-500">{formatUtc(event.occurredAt)} UTC</time>
                </div>
                <p className="mt-1 text-sm text-slate-600">By {event.actorLabel}</p>
                <details className="mt-2">
                  <summary className="cursor-pointer text-xs font-semibold text-slate-500 hover:text-slate-800">
                    Event payload
                  </summary>
                  <code className="mt-2 block break-all rounded bg-slate-50 px-3 py-2 text-xs text-slate-600">
                    {JSON.stringify(event.payload)}
                  </code>
                </details>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
