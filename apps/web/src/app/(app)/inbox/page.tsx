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

function ruleId(evidence: unknown): string {
  if (!evidence || typeof evidence !== "object" || Array.isArray(evidence)) return "No evidence";
  const value = Reflect.get(evidence, "ruleId");
  return typeof value === "string" ? value.replaceAll("-", " ") : "No evidence";
}

export default async function InboxPage() {
  const user = await requireUser();
  assertCan(user.role, "order:write");
  const messages = await prisma.emailMessage.findMany({
    where: { triageStatus: "UNREVIEWED" },
    orderBy: { receivedAt: "asc" },
    include: {
      client: { select: { displayName: true } },
      proposals: {
        where: { status: "PENDING" },
        orderBy: { createdAt: "asc" },
        take: 1,
      },
    },
  });

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-indigo-600">
          Gmail intake
        </p>
        <h1 className="mt-1 text-2xl font-bold text-slate-950">Review inbox</h1>
        <p className="mt-1 text-sm text-slate-600">
          Rule-based proposals only. Every order and outbound email still requires a human decision.
        </p>
      </div>

      {messages.length === 0 ? (
        <div className="min-h-52 rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center">
          <h2 className="font-semibold text-slate-900">Inbox is clear</h2>
          <p className="mt-2 text-sm text-slate-600">
            Newly ingested Gmail messages will appear here for review.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-5 py-3 font-semibold">Received</th>
                  <th className="px-5 py-3 font-semibold">Email</th>
                  <th className="px-5 py-3 font-semibold">Client</th>
                  <th className="px-5 py-3 font-semibold">Proposal</th>
                  <th className="px-5 py-3 font-semibold">Evidence</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {messages.map((message) => {
                  const proposal = message.proposals[0];
                  return (
                    <tr key={message.id} className="hover:bg-slate-50">
                      <td className="whitespace-nowrap px-5 py-4 text-slate-600">
                        {formatUtc(message.receivedAt)} UTC
                      </td>
                      <td className="max-w-md px-5 py-4">
                        <Link
                          href={`/inbox/${message.id}`}
                          className="font-semibold text-indigo-700 hover:text-indigo-900"
                        >
                          {message.subject || "(No subject)"}
                        </Link>
                        <p className="mt-1 truncate text-slate-600">{message.fromAddress}</p>
                      </td>
                      <td className="px-5 py-4 text-slate-700">
                        {message.client?.displayName ?? "Unresolved"}
                      </td>
                      <td className="px-5 py-4">
                        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
                          {proposal?.kind.replaceAll("_", " ") ?? "Missing"}
                        </span>
                      </td>
                      <td className="px-5 py-4 capitalize text-slate-600">
                        {ruleId(proposal?.evidence)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
