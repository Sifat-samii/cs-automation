"use client";

import { useActionState, useState } from "react";
import { createOrderAction, type OrderActionState } from "@/app/(app)/orders/actions";
import { SubmitButton } from "@/app/(app)/_components/submit-button";

const initialState: OrderActionState = { error: null };

type ClientOption = {
  id: string;
  code: string;
  displayName: string;
};

export function OrderForm({ clients }: { clients: readonly ClientOption[] }) {
  const [state, formAction] = useActionState(createOrderAction, initialState);
  const [clientId, setClientId] = useState(clients[0]?.id ?? "");

  return (
    <form
      action={formAction}
      className="space-y-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
    >
      <label className="block space-y-2 text-sm font-medium text-slate-700">
        Client
        <select
          name="clientId"
          required
          value={clientId}
          disabled={clients.length === 0}
          onChange={(event) => setClientId(event.target.value)}
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 outline-none focus:border-slate-600 disabled:bg-slate-100"
        >
          {clients.length === 0 ? (
            <option value="">No active clients available</option>
          ) : (
            clients.map((client) => (
              <option key={client.id} value={client.id}>
                {client.code} — {client.displayName}
              </option>
            ))
          )}
        </select>
      </label>

      <div className="grid gap-5 md:grid-cols-2">
        <label className="space-y-2 text-sm font-medium text-slate-700">
          Order title
          <input
            name="title"
            required
            maxLength={500}
            placeholder="Kirkland Spring Drop"
            className="w-full rounded-lg border border-slate-300 px-3 py-2.5 outline-none focus:border-slate-600"
          />
        </label>
        <label className="space-y-2 text-sm font-medium text-slate-700">
          Order type
          <input
            name="orderType"
            required
            maxLength={200}
            placeholder="Retouching"
            className="w-full rounded-lg border border-slate-300 px-3 py-2.5 outline-none focus:border-slate-600"
          />
        </label>
      </div>

      <label className="block max-w-xs space-y-2 text-sm font-medium text-slate-700">
        Quantity
        <input
          name="quantity"
          type="number"
          min={1}
          step={1}
          className="w-full rounded-lg border border-slate-300 px-3 py-2.5 outline-none focus:border-slate-600"
        />
      </label>

      <fieldset className="space-y-4 rounded-lg border border-slate-200 p-4">
        <legend className="px-1 text-sm font-semibold text-slate-800">Initial source</legend>
        <label className="block space-y-2 text-sm font-medium text-slate-700">
          Source kind
          <select
            name="sourceKind"
            defaultValue=""
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5"
          >
            <option value="">No source yet</option>
            <option value="DROPBOX">Dropbox link</option>
            <option value="GDRIVE">Google Drive link</option>
            <option value="ATTACHMENT">Email attachment reference</option>
            <option value="MANUAL_DROP">Manual drop</option>
            <option value="OTHER">Other</option>
          </select>
        </label>
        <label className="block space-y-2 text-sm font-medium text-slate-700">
          URL
          <input
            name="sourceUrl"
            type="url"
            maxLength={2048}
            placeholder="https://..."
            className="w-full rounded-lg border border-slate-300 px-3 py-2.5"
          />
        </label>
        <label className="block space-y-2 text-sm font-medium text-slate-700">
          Local hint
          <input
            name="sourceLocalHint"
            maxLength={500}
            placeholder="Where the files will be supplied"
            className="w-full rounded-lg border border-slate-300 px-3 py-2.5"
          />
        </label>
      </fieldset>

      <p role="alert" aria-live="polite" className="min-h-5 text-sm text-red-700">
        {state.error ?? ""}
      </p>
      <div className="flex justify-end">
        <SubmitButton
          label="Create order"
          pendingLabel="Creating order..."
          disabled={clients.length === 0}
        />
      </div>
    </form>
  );
}
