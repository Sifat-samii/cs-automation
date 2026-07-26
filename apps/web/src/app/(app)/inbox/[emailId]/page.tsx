import { prisma, type Prisma } from "@cs/db";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ProposalReviewActions, type InboxReviewOptions } from "@/app/(app)/inbox/review-actions";
import { requireUser } from "@/lib/auth/current-user";
import { assertCan, can } from "@/lib/auth/rbac";

function jsonObject(value: Prisma.JsonValue): Record<string, Prisma.JsonValue> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, Prisma.JsonValue>)
    : null;
}

function jsonString(value: Record<string, Prisma.JsonValue> | null, key: string): string {
  const field = value?.[key];
  return typeof field === "string" ? field : "";
}

function firstProposedDownloadUrl(payload: Record<string, Prisma.JsonValue> | null): string {
  const dropbox = payload?.dropboxUrls;
  if (Array.isArray(dropbox) && typeof dropbox[0] === "string") return dropbox[0];
  const drive = payload?.driveUrls;
  if (Array.isArray(drive) && typeof drive[0] === "string") return drive[0];
  return "";
}

export default async function InboxDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ emailId: string }>;
  searchParams: Promise<{ clientId?: string }>;
}) {
  const user = await requireUser();
  assertCan(user.role, "order:write");
  const { emailId } = await params;
  const query = await searchParams;
  const [message, clients, orders] = await Promise.all([
    prisma.emailMessage.findUnique({
      where: { id: emailId },
      include: {
        client: true,
        order: { select: { id: true, code: true, title: true } },
        proposals: { orderBy: { createdAt: "asc" } },
      },
    }),
    prisma.client.findMany({
      where: { isActive: true },
      orderBy: { displayName: "asc" },
      select: { id: true, code: true, displayName: true },
    }),
    prisma.order.findMany({
      where: { status: { notIn: ["CLOSED", "CANCELLED"] } },
      orderBy: { createdAt: "desc" },
      take: 250,
      select: { id: true, code: true, title: true },
    }),
  ]);
  if (!message) notFound();
  const proposal =
    message.proposals.find((candidate) => candidate.status === "PENDING") ??
    message.proposals.at(-1);
  const payload = proposal ? jsonObject(proposal.payload) : null;
  const options: InboxReviewOptions = {
    clients: clients.map((client) => ({
      id: client.id,
      label: `${client.code} — ${client.displayName}`,
    })),
    orders: orders.map((order) => ({
      id: order.id,
      label: `${order.code} — ${order.title}`,
    })),
  };

  return (
    <div className="space-y-6">
      <div>
        <Link href="/inbox" className="text-sm font-semibold text-indigo-700 hover:text-indigo-900">
          ← Back to inbox
        </Link>
        <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm text-slate-600">{message.fromAddress}</p>
            <h1 className="mt-1 text-2xl font-bold text-slate-950">
              {message.subject || "(No subject)"}
            </h1>
          </div>
          <span className="rounded-full bg-slate-900 px-3 py-1.5 text-xs font-bold text-white">
            {message.triageStatus.replaceAll("_", " ")}
          </span>
        </div>
      </div>

      <section className="grid gap-4 lg:grid-cols-2">
        <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="font-semibold text-slate-950">Raw message</h2>
          <dl className="mt-4 space-y-2 text-sm">
            <div>
              <dt className="text-xs uppercase tracking-wide text-slate-500">Thread</dt>
              <dd className="mt-1 break-all font-mono text-slate-700">{message.gmailThreadId}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-slate-500">To</dt>
              <dd className="mt-1 text-slate-700">{message.toAddresses.join(", ")}</dd>
            </div>
          </dl>
          <pre className="mt-4 max-h-[32rem] overflow-auto whitespace-pre-wrap rounded-lg bg-slate-50 p-4 font-sans text-sm text-slate-800">
            {message.bodyText || "(Empty body)"}
          </pre>
        </article>

        <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="font-semibold text-slate-950">Rule proposal</h2>
          {proposal ? (
            <>
              <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold">
                <span className="rounded-full bg-indigo-100 px-2.5 py-1 text-indigo-800">
                  {proposal.kind.replaceAll("_", " ")}
                </span>
                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-700">
                  {proposal.source} · {proposal.confidence.toString()}
                </span>
                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-700">
                  {proposal.status}
                </span>
              </div>
              <h3 className="mt-5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Payload
              </h3>
              <pre className="mt-2 overflow-auto whitespace-pre-wrap rounded-lg bg-slate-50 p-4 text-xs text-slate-700">
                {JSON.stringify(proposal.payload, null, 2)}
              </pre>
              <h3 className="mt-5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Evidence
              </h3>
              <pre className="mt-2 overflow-auto whitespace-pre-wrap rounded-lg bg-slate-50 p-4 text-xs text-slate-700">
                {JSON.stringify(proposal.evidence, null, 2)}
              </pre>
            </>
          ) : (
            <p className="mt-4 text-sm text-red-700">This email has no proposal.</p>
          )}
        </article>
      </section>

      {proposal && proposal.status === "PENDING" && message.triageStatus === "UNREVIEWED" && (
        <section>
          <h2 className="mb-4 text-lg font-bold text-slate-950">Review decision</h2>
          <ProposalReviewActions
            emailMessageId={message.id}
            proposalId={proposal.id}
            proposedKind={proposal.kind}
            proposedClientId={
              query.clientId || jsonString(payload, "clientId") || message.clientId
            }
            proposedOrderId={jsonString(payload, "orderId") || message.orderId}
            proposedTitle={jsonString(payload, "title") || message.subject}
            proposedOrderType={jsonString(payload, "orderType") || "Email intake"}
            proposedDownloadUrl={firstProposedDownloadUrl(payload)}
            fromAddress={message.fromAddress}
            canManageClients={can(user.role, "client:manage")}
            options={options}
          />
        </section>
      )}
    </div>
  );
}
