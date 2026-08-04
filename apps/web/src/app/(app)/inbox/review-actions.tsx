"use client";

import { useActionState } from "react";
import {
  approveProposalAction,
  ignoreEmailAction,
  type InboxActionState,
} from "@/app/(app)/inbox/actions";
import { AddClientModal } from "@/app/(app)/inbox/add-client-modal";
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
  proposedDownloadUrl,
  fromAddress,
  canManageClients,
  options,
}: {
  emailMessageId: string;
  proposalId: string;
  proposedKind: string;
  proposedClientId: string | null;
  proposedOrderId: string | null;
  proposedTitle: string;
  proposedOrderType: string;
  proposedDownloadUrl: string;
  fromAddress: string;
  canManageClients: boolean;
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
          {proposedDownloadUrl ? (
            <input type="hidden" name="downloadUrl" value={proposedDownloadUrl} />
          ) : null}
          <h3 className="font-semibold text-indigo-950">Approve as proposed</h3>
          <p className="mt-1 text-sm text-indigo-800">
            This creates the proposed order or batch and queues file download when a source link is
            present. A receipt acknowledgement was already sent when the email arrived.
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
        <p className="text-sm text-slate-600">
          Saves the order, optional ETA, and download link, then starts file transfer when a link is
          present.
        </p>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1 text-sm font-medium text-slate-700">
            <label className="block space-y-1">
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
            {!proposedClientId ? (
              <>
                <span className="block text-xs font-normal text-amber-800">
                  No client matched sender {fromAddress}. Select a client before approving.
                </span>
                {canManageClients ? (
                  <AddClientModal
                    emailMessageId={emailMessageId}
                    fromAddress={fromAddress}
                    suggestedDisplayName=""
                  />
                ) : null}
              </>
            ) : null}
          </div>
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
          <label className="space-y-1 text-sm font-medium text-slate-700 md:col-span-2">
            Download link
            <input
              name="downloadUrl"
              type="url"
              defaultValue={proposedDownloadUrl}
              placeholder="https://..."
              className="w-full rounded-lg border border-slate-300 px-3 py-2"
            />
            <span className="block text-xs font-normal text-slate-500">
              Leave blank if none. Prefills from Dropbox/Drive URLs found in the email when present.
            </span>
          </label>
          <label className="space-y-1 text-sm font-medium text-slate-700 md:col-span-2">
            ETA (optional)
            <input
              name="eta"
              type="datetime-local"
              className="w-full rounded-lg border border-slate-300 px-3 py-2"
            />
          </label>
        </div>
        <SubmitButton label="Save order and start download" pendingLabel="Approving..." />
        <ActionError error={approvalState.error} />
      </form>

      <form action={approveAction} className="space-y-4 rounded-xl border border-slate-200 p-4">
        <input type="hidden" name="proposalId" value={proposalId} />
        {proposedDownloadUrl ? (
          <input type="hidden" name="downloadUrl" value={proposedDownloadUrl} />
        ) : null}
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
        <label className="space-y-1 text-sm font-medium text-slate-700">
          ETA (optional)
          <input
            name="eta"
            type="datetime-local"
            className="w-full rounded-lg border border-slate-300 px-3 py-2"
          />
        </label>
        <SubmitButton label="Link and approve" pendingLabel="Linking..." />
        <ActionError error={approvalState.error} />
      </form>

      <form action={ignoreAction} className="rounded-xl border border-red-200 bg-red-50 p-4">
        <input type="hidden" name="emailMessageId" value={emailMessageId} />
        <h3 className="font-semibold text-red-950">Ignore this email</h3>
        <p className="mt-1 text-sm text-red-800">
          This rejects the pending proposal without creating an order.
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
