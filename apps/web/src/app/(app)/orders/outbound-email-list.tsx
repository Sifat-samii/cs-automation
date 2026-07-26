"use client";

import { useActionState } from "react";
import { approveOutboundEmailAction, type OrderActionState } from "@/app/(app)/orders/actions";
import { SubmitButton } from "@/app/(app)/_components/submit-button";
import { GATE_BLOCKED_PLACEHOLDER } from "@/lib/outbound/templates";

const initialState: OrderActionState = { error: null };

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

function OutboundDraft({ orderId, outbound }: { orderId: string; outbound: OutboundEmailView }) {
  const [state, action] = useActionState(approveOutboundEmailAction, initialState);
  const gateBlocked =
    outbound.renderedSubject.includes(GATE_BLOCKED_PLACEHOLDER) ||
    outbound.renderedBody.includes(GATE_BLOCKED_PLACEHOLDER);

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
        {outbound.renderedBody}
      </pre>
      {gateBlocked && (
        <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          Approval is fail-closed until owner-approved subject and body copy replaces the gate
          placeholder.
        </p>
      )}
      {outbound.lastError && (
        <p className="mt-3 text-sm text-red-700">Last send error: {outbound.lastError}</p>
      )}
      {outbound.sentMessageId && (
        <p className="mt-3 break-all text-xs text-slate-500">
          Gmail message: {outbound.sentMessageId}
        </p>
      )}
      {outbound.status === "DRAFT" && (
        <form action={action} className="mt-4">
          <input type="hidden" name="orderId" value={orderId} />
          <input type="hidden" name="outboundEmailId" value={outbound.id} />
          <SubmitButton
            label={gateBlocked ? "Approval blocked" : "Approve for sending"}
            pendingLabel="Approving..."
            disabled={gateBlocked}
          />
          <p role="alert" aria-live="polite" className="mt-2 min-h-5 text-sm text-red-700">
            {state.error ?? ""}
          </p>
        </form>
      )}
    </article>
  );
}

export function OutboundEmailList({
  orderId,
  outboundEmails,
}: {
  orderId: string;
  outboundEmails: readonly OutboundEmailView[];
}) {
  if (outboundEmails.length === 0) {
    return <p className="text-sm text-slate-500">No outbound drafts have been created.</p>;
  }
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {outboundEmails.map((outbound) => (
        <OutboundDraft key={outbound.id} orderId={orderId} outbound={outbound} />
      ))}
    </div>
  );
}
