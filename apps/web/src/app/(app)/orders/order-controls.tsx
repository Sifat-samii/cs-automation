"use client";

import {
  BATCH_STATUSES,
  ORDER_STATUSES,
  batchTransition,
  orderTransition,
  type BatchStatus,
  type OrderStatus,
} from "@cs/shared/lifecycle";
import { useActionState } from "react";
import {
  addBatchAction,
  setBatchStatusAction,
  setEtaAction,
  setOrderStatusAction,
  type OrderActionState,
} from "@/app/(app)/orders/actions";
import { SubmitButton } from "@/app/(app)/_components/submit-button";

const initialState: OrderActionState = { error: null };

function ActionError({ error }: OrderActionState) {
  return (
    <p role="alert" aria-live="polite" className="min-h-5 text-xs text-red-700">
      {error ?? ""}
    </p>
  );
}

export function OrderStatusForm({ orderId, status }: { orderId: string; status: OrderStatus }) {
  const [state, action] = useActionState(setOrderStatusAction, initialState);
  const nextStatuses = ORDER_STATUSES.filter((next) => orderTransition(status, next));
  if (nextStatuses.length === 0) {
    return <p className="text-sm text-slate-500">This order is terminal.</p>;
  }

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="orderId" value={orderId} />
      <label className="block space-y-1 text-sm font-medium text-slate-700">
        Next status
        <select
          name="status"
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
        >
          {nextStatuses.map((next) => (
            <option key={next} value={next}>
              {next.replaceAll("_", " ")}
            </option>
          ))}
        </select>
      </label>
      <label className="block space-y-1 text-sm font-medium text-slate-700">
        Cancellation reason, if applicable
        <input
          name="cancelReason"
          maxLength={1000}
          className="w-full rounded-lg border border-slate-300 px-3 py-2"
        />
      </label>
      <ActionError error={state.error} />
      <SubmitButton label="Update order status" pendingLabel="Updating status..." />
    </form>
  );
}

export function EtaForm({ orderId }: { orderId: string }) {
  const [state, action] = useActionState(setEtaAction, initialState);
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="orderId" value={orderId} />
      <label className="block space-y-1 text-sm font-medium text-slate-700">
        ETA
        <input
          name="eta"
          type="datetime-local"
          required
          className="w-full rounded-lg border border-slate-300 px-3 py-2"
        />
      </label>
      <label className="block space-y-1 text-sm font-medium text-slate-700">
        Note
        <input
          name="note"
          maxLength={1000}
          className="w-full rounded-lg border border-slate-300 px-3 py-2"
        />
      </label>
      <ActionError error={state.error} />
      <SubmitButton label="Set ETA" pendingLabel="Saving ETA..." />
    </form>
  );
}

export function AddBatchForm({ orderId }: { orderId: string }) {
  const [state, action] = useActionState(addBatchAction, initialState);
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="orderId" value={orderId} />
      <label className="block space-y-1 text-sm font-medium text-slate-700">
        Batch kind
        <select
          name="kind"
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
        >
          <option value="ADDITIONAL">Additional</option>
          <option value="SAMPLE">Sample</option>
          <option value="CORRECTION">Correction</option>
        </select>
      </label>
      <label className="block space-y-1 text-sm font-medium text-slate-700">
        Notes
        <input
          name="notes"
          maxLength={1000}
          className="w-full rounded-lg border border-slate-300 px-3 py-2"
        />
      </label>
      <label className="block space-y-1 text-sm font-medium text-slate-700">
        Source kind
        <select
          name="sourceKind"
          defaultValue=""
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
        >
          <option value="">No source yet</option>
          <option value="DROPBOX">Dropbox</option>
          <option value="GDRIVE">Google Drive</option>
          <option value="ATTACHMENT">Attachment</option>
          <option value="MANUAL_DROP">Manual drop</option>
          <option value="OTHER">Other</option>
        </select>
      </label>
      <label className="block space-y-1 text-sm font-medium text-slate-700">
        Source URL
        <input
          name="sourceUrl"
          type="url"
          maxLength={2048}
          className="w-full rounded-lg border border-slate-300 px-3 py-2"
        />
      </label>
      <label className="block space-y-1 text-sm font-medium text-slate-700">
        Local hint
        <input
          name="sourceLocalHint"
          maxLength={500}
          className="w-full rounded-lg border border-slate-300 px-3 py-2"
        />
      </label>
      <ActionError error={state.error} />
      <SubmitButton label="Add batch" pendingLabel="Adding batch..." />
    </form>
  );
}

export function BatchStatusForm({
  orderId,
  batchId,
  status,
}: {
  orderId: string;
  batchId: string;
  status: BatchStatus;
}) {
  const [state, action] = useActionState(setBatchStatusAction, initialState);
  const nextStatuses = BATCH_STATUSES.filter((next) => batchTransition(status, next));
  if (nextStatuses.length === 0) {
    return <p className="text-xs text-slate-500">Terminal batch</p>;
  }

  return (
    <form action={action} className="mt-4 space-y-2 border-t border-slate-200 pt-4">
      <input type="hidden" name="orderId" value={orderId} />
      <input type="hidden" name="batchId" value={batchId} />
      <label className="block space-y-1 text-xs font-medium text-slate-700">
        Next batch status
        <select
          name="status"
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
        >
          {nextStatuses.map((next) => (
            <option key={next} value={next}>
              {next.replaceAll("_", " ")}
            </option>
          ))}
        </select>
      </label>
      <label className="block space-y-1 text-xs font-medium text-slate-700">
        Failure reason, if applicable
        <input
          name="failureReason"
          maxLength={1000}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
      </label>
      <ActionError error={state.error} />
      <SubmitButton label="Update batch" pendingLabel="Updating batch..." className="w-full" />
    </form>
  );
}
