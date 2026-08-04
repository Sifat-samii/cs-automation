"use client";

import { useActionState } from "react";
import {
  approveOrderAction,
  sendQueryEmailAction,
  type OrderActionState,
} from "@/app/(app)/orders/actions";
import { SubmitButton } from "@/app/(app)/_components/submit-button";

const initialState: OrderActionState = { error: null };

export function OrderDecisionPanel({ orderId }: { orderId: string }) {
  const [approveState, approveAction] = useActionState(approveOrderAction, initialState);
  const [queryState, queryAction] = useActionState(sendQueryEmailAction, initialState);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 lg:grid-cols-2">
        <form
          action={approveAction}
          className="space-y-3 rounded-xl border border-slate-200 bg-white p-4"
        >
          <h3 className="text-sm font-semibold text-slate-900">Approve with ETA</h3>
          <p className="text-xs text-slate-600">
            Moves the order to In Production, locks the ETA, and sends a confirmation email.
          </p>
          <input type="hidden" name="orderId" value={orderId} />
          <input type="hidden" name="withEta" value="true" />
          <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
            ETA (UTC)
            <input
              type="datetime-local"
              name="eta"
              required
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900"
            />
          </label>
          <SubmitButton label="Approve with ETA" pendingLabel="Approving..." />
          <p role="alert" aria-live="polite" className="min-h-5 text-sm text-red-700">
            {approveState.error ?? ""}
          </p>
        </form>

        <form
          action={approveAction}
          className="space-y-3 rounded-xl border border-slate-200 bg-white p-4"
        >
          <h3 className="text-sm font-semibold text-slate-900">Approve without ETA</h3>
          <p className="text-xs text-slate-600">
            Moves the order to In Production with an ETA Required tag. You can set the ETA later.
          </p>
          <input type="hidden" name="orderId" value={orderId} />
          <input type="hidden" name="withEta" value="false" />
          <SubmitButton label="Approve without ETA" pendingLabel="Approving..." />
        </form>
      </div>

      <form
        action={queryAction}
        className="space-y-3 rounded-xl border border-slate-200 bg-white p-4"
      >
        <h3 className="text-sm font-semibold text-slate-900">Send query email</h3>
        <p className="text-xs text-slate-600">
          AI drafts a professional reply in the client thread. The order stays Unassigned until you
          approve it.
        </p>
        <input type="hidden" name="orderId" value={orderId} />
        <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
          Query
          <textarea
            name="queryText"
            required
            minLength={3}
            rows={4}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900"
            placeholder="Ask the client about missing files, quantity, or clarification…"
          />
        </label>
        <SubmitButton label="Send Email" pendingLabel="Sending..." />
        <p role="alert" aria-live="polite" className="min-h-5 text-sm text-red-700">
          {queryState.error ?? ""}
        </p>
      </form>
    </div>
  );
}
