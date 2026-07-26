"use client";

import { useActionState } from "react";
import {
  approveProposalAction,
  ignoreEmailAction,
  type InboxActionState,
} from "@/app/(app)/inbox/actions";
import { SubmitButton } from "@/app/(app)/_components/submit-button";

const initialState: InboxActionState = { error: null };

function ActionError({ error }: InboxActionState) {
  return (
    <p role="alert" aria-live="polite" className="min-h-5 text-sm text-red-700">
      {error ?? ""}
    </p>
  );
}

export type InboxReviewOptions = {
  clients: readonly { id: string; label: string }[];
  orders: readonly { id: string; label: string }[];
};

export function ProposalReviewActions({
  emailMessageId,
  proposalId,
  proposedKind,
  proposedClientId,
  proposedOrderId,
  proposedTitle,
  proposedOrderType,
  options,
}: {
  emailMessageId: string;
  proposalId: string;
  proposedKind: string;
  proposedClientId: string | null;
  proposedOrderId: string | null;
  proposedTitle: string;
  proposedOrderType: string;
  options: InboxReviewOptions;
}) {
  const [approvalState, approveAction] = useActionState(approveProposalAction, initialState);
  const [ignoreState, ignoreAction] = useActionState(ignoreEmailAction, initialState);

  return (
    <div className="space-y-5">
      {(proposedKind === "CREATE_ORDER" || proposedKind === "ADD_BATCH") && (
        <form
          action={approveAction}
          className="rounded-xl border border-indigo-200 bg-indigo-50 p-4"
        >
          <input type="hidden" name="proposalId" value={proposalId} />
          <h3 className="font-semibold text-indigo-950">Approve as proposed</h3>
          <p className="mt-1 text-sm text-indigo-800">
            This creates the proposed order or batch, queues its transfer, and drafts an
            acknowledgement.
          </p>
          <div className="mt-3">
            <SubmitButton label="Approve proposal" pendingLabel="Approving..." />
          </div>
          <ActionError error={approvalState.error} />
        </form>
      )}

      <form action={approveAction} className="space-y-4 rounded-xl border border-slate-200 p-4">
        <input type="hidden" name="proposalId" value={proposalId} />
        <h3 className="font-semibold text-slate-950">Edit and approve</h3>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="space-y-1 text-sm font-medium text-slate-700">
            Client
            <select
              name="clientId"
              defaultValue={proposedClientId ?? ""}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
            >
              <option value="">Choose client</option>
              {options.clients.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.label}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-sm font-medium text-slate-700">
            Title
            <input
              name="title"
              defaultValue={proposedTitle}
              maxLength={500}
              className="w-full rounded-lg border border-slate-300 px-3 py-2"
            />
          </label>
          <label className="space-y-1 text-sm font-medium text-slate-700">
            Order type
            <input
              name="orderType"
              defaultValue={proposedOrderType}
              maxLength={200}
              className="w-full rounded-lg border border-slate-300 px-3 py-2"
            />
          </label>
          <label className="space-y-1 text-sm font-medium text-slate-700">
            Quantity
            <input
              name="quantity"
              type="number"
              min={1}
              className="w-full rounded-lg border border-slate-300 px-3 py-2"
            />
          </label>
        </div>
        <SubmitButton label="Save fields and approve" pendingLabel="Approving..." />
        <ActionError error={approvalState.error} />
      </form>

      <form action={approveAction} className="space-y-4 rounded-xl border border-slate-200 p-4">
        <input type="hidden" name="proposalId" value={proposalId} />
        <h3 className="font-semibold text-slate-950">Link to another order</h3>
        <label className="space-y-1 text-sm font-medium text-slate-700">
          Existing order
          <select
            name="targetOrderId"
            defaultValue={proposedOrderId ?? ""}
            required
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
          >
            <option value="">Choose order</option>
            {options.orders.map((order) => (
              <option key={order.id} value={order.id}>
                {order.label}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-sm font-medium text-slate-700">
          Batch kind
          <select
            name="batchKind"
            defaultValue="ADDITIONAL"
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
          >
            <option value="ADDITIONAL">Additional</option>
            <option value="SAMPLE">Sample</option>
            <option value="CORRECTION">Correction</option>
          </select>
        </label>
        <SubmitButton label="Link and approve" pendingLabel="Linking..." />
        <ActionError error={approvalState.error} />
      </form>

      <form action={ignoreAction} className="rounded-xl border border-red-200 bg-red-50 p-4">
        <input type="hidden" name="emailMessageId" value={emailMessageId} />
        <h3 className="font-semibold text-red-950">Ignore this email</h3>
        <p className="mt-1 text-sm text-red-800">
          This rejects the pending proposal without creating an order or outbound draft.
        </p>
        <div className="mt-3">
          <SubmitButton
            label="Ignore email"
            pendingLabel="Ignoring..."
            className="bg-red-700 hover:bg-red-800"
          />
        </div>
        <ActionError error={ignoreState.error} />
      </form>
    </div>
  );
}
