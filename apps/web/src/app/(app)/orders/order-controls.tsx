"use client";

import { useActionState } from "react";
import {
  addBatchAction,
  markReadyToUploadAction,
  setEtaAction,
  togglePauseAction,
  updateOrderDetailsAction,
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

export function EditOrderDetailsForm({
  orderId,
  title,
  orderType,
  quantity,
}: {
  orderId: string;
  title: string;
  orderType: string;
  quantity: string | null;
}) {
  const [state, action] = useActionState(updateOrderDetailsAction, initialState);
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="orderId" value={orderId} />
      <label className="block space-y-1 text-sm font-medium text-slate-700">
        Title
        <input
          name="title"
          required
          maxLength={500}
          defaultValue={title}
          className="w-full rounded-lg border border-slate-300 px-3 py-2"
        />
      </label>
      <label className="block space-y-1 text-sm font-medium text-slate-700">
        Order type
        <input
          name="orderType"
          required
          maxLength={200}
          defaultValue={orderType}
          className="w-full rounded-lg border border-slate-300 px-3 py-2"
        />
      </label>
      <label className="block space-y-1 text-sm font-medium text-slate-700">
        Quantity
        <input
          name="quantity"
          type="number"
          min={1}
          defaultValue={quantity ?? ""}
          className="w-full rounded-lg border border-slate-300 px-3 py-2"
        />
      </label>
      <label className="block space-y-1 text-sm font-medium text-slate-700">
        Reason for emergency edit
        <input
          name="reason"
          required
          minLength={5}
          maxLength={1000}
          className="w-full rounded-lg border border-slate-300 px-3 py-2"
          placeholder="Why is this edit necessary?"
        />
      </label>
      <ActionError error={state.error} />
      <SubmitButton label="Save emergency edit" pendingLabel="Saving..." />
    </form>
  );
}

export function EtaForm({ orderId, etaLocked }: { orderId: string; etaLocked: boolean }) {
  const [state, action] = useActionState(setEtaAction, initialState);
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="orderId" value={orderId} />
      <label className="block space-y-1 text-sm font-medium text-slate-700">
        ETA (UTC)
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
      {etaLocked ? (
        <label className="block space-y-1 text-sm font-medium text-slate-700">
          Reason for ETA change
          <input
            name="reason"
            required
            minLength={5}
            maxLength={1000}
            className="w-full rounded-lg border border-slate-300 px-3 py-2"
          />
        </label>
      ) : (
        <input type="hidden" name="reason" value="" />
      )}
      <ActionError error={state.error} />
      <SubmitButton
        label={etaLocked ? "Update locked ETA" : "Set ETA"}
        pendingLabel="Saving ETA..."
      />
    </form>
  );
}

export function PauseResumeForm({ orderId, paused }: { orderId: string; paused: boolean }) {
  const [state, action] = useActionState(togglePauseAction, initialState);
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="orderId" value={orderId} />
      <input type="hidden" name="paused" value={paused ? "false" : "true"} />
      <p className="text-sm text-slate-600">
        {paused
          ? "Client email is paused. Transfers continue. Resume to allow outbound mail again."
          : "Pause stops AI and workflow emails for this thread. Transfers continue."}
      </p>
      <ActionError error={state.error} />
      <SubmitButton
        label={paused ? "Resume Order" : "Pause Order"}
        pendingLabel={paused ? "Resuming..." : "Pausing..."}
      />
    </form>
  );
}

export function ReadyToUploadForm({ orderId }: { orderId: string }) {
  const [state, action] = useActionState(markReadyToUploadAction, initialState);
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="orderId" value={orderId} />
      <p className="text-sm text-slate-600">
        Marks this order Ready to Upload. Upload delivery is configured in a later phase.
      </p>
      <ActionError error={state.error} />
      <SubmitButton label="Ready to Upload" pendingLabel="Updating..." />
    </form>
  );
}

export function AddBatchForm({ orderId }: { orderId: string }) {
  const [state, action] = useActionState(addBatchAction, initialState);
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="orderId" value={orderId} />
      <label className="block space-y-1 text-sm font-medium text-slate-700">
        Kind
        <select
          name="kind"
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
        >
          <option value="ADDITIONAL">ADDITIONAL</option>
          <option value="SAMPLE">SAMPLE</option>
          <option value="CORRECTION">CORRECTION</option>
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
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
          defaultValue=""
        >
          <option value="">None</option>
          <option value="DROPBOX">DROPBOX</option>
          <option value="GDRIVE">GDRIVE</option>
          <option value="ATTACHMENT">ATTACHMENT</option>
          <option value="MANUAL_DROP">MANUAL_DROP</option>
          <option value="OTHER">OTHER</option>
        </select>
      </label>
      <label className="block space-y-1 text-sm font-medium text-slate-700">
        Source URL
        <input
          name="sourceUrl"
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
      <SubmitButton label="Add batch" pendingLabel="Adding..." />
    </form>
  );
}
