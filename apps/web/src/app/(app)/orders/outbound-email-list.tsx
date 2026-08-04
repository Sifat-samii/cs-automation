"use client";

export type OutboundEmailView = {
  id: string;
  template: string;
  renderedSubject: string;
  renderedBody: string;
  status: string;
  approvedAt: string | null;
  sentMessageId: string | null;
  lastError: string | null;
};

function OutboundCard({ outbound }: { outbound: OutboundEmailView }) {
  return (
    <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-indigo-600">
            {outbound.template.replaceAll("_", " ")}
          </p>
          <h3 className="mt-1 font-semibold text-slate-950">{outbound.renderedSubject}</h3>
        </div>
        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
          {outbound.status}
        </span>
      </div>
      <pre className="mt-4 whitespace-pre-wrap rounded-lg bg-slate-50 p-3 font-sans text-sm text-slate-700">
        {outbound.renderedBody.replaceAll("<br>", "\n").replaceAll(/<[^>]+>/gu, "")}
      </pre>
      {outbound.lastError && (
        <p className="mt-3 text-sm text-red-700">Last send error: {outbound.lastError}</p>
      )}
      {outbound.sentMessageId && (
        <p className="mt-3 break-all text-xs text-slate-500">
          Gmail message: {outbound.sentMessageId}
        </p>
      )}
    </article>
  );
}

export function OutboundEmailList({
  outboundEmails,
}: {
  orderId?: string;
  outboundEmails: readonly OutboundEmailView[];
}) {
  if (outboundEmails.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-600">
        No outbound email has been drafted for this order yet.
      </div>
    );
  }
  return (
    <div className="space-y-4">
      {outboundEmails.map((outbound) => (
        <OutboundCard key={outbound.id} outbound={outbound} />
      ))}
    </div>
  );
}
