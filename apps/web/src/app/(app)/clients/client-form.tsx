"use client";

import { useActionState } from "react";
import { createClientAction, type ClientActionState } from "@/app/(app)/clients/actions";
import { SubmitButton } from "@/app/(app)/_components/submit-button";

const initialState: ClientActionState = { error: null };

export function ClientForm() {
  const [state, formAction] = useActionState(createClientAction, initialState);

  return (
    <form
      action={formAction}
      className="space-y-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
    >
      <div className="grid gap-5 md:grid-cols-2">
        <label className="space-y-2 text-sm font-medium text-slate-700">
          Client code
          <input
            name="code"
            required
            maxLength={12}
            placeholder="VRLY"
            className="w-full rounded-lg border border-slate-300 px-3 py-2.5 uppercase outline-none focus:border-slate-600"
          />
          <span className="block text-xs font-normal text-slate-500">
            2–12 letters or numbers; used in every order code.
          </span>
        </label>
        <label className="space-y-2 text-sm font-medium text-slate-700">
          Display name
          <input
            name="displayName"
            required
            maxLength={200}
            placeholder="Verily"
            className="w-full rounded-lg border border-slate-300 px-3 py-2.5 outline-none focus:border-slate-600"
          />
          <span className="block text-xs font-normal text-slate-500">
            Share folders are created automatically from this name on backup and production.
          </span>
        </label>
      </div>

      <fieldset className="space-y-4 rounded-lg border border-slate-200 p-4">
        <legend className="px-1 text-sm font-semibold text-slate-800">Sender matching</legend>
        <label className="block space-y-2 text-sm font-medium text-slate-700">
          Exact email address
          <input
            name="address"
            type="email"
            maxLength={320}
            placeholder="orders@example.com"
            className="w-full rounded-lg border border-slate-300 px-3 py-2.5 outline-none focus:border-slate-600"
          />
        </label>
        <label className="block space-y-2 text-sm font-medium text-slate-700">
          Email domain
          <input
            name="domain"
            maxLength={253}
            placeholder="example.com"
            className="w-full rounded-lg border border-slate-300 px-3 py-2.5 outline-none focus:border-slate-600"
          />
        </label>
      </fieldset>

      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton label="Register client" pendingLabel="Registering..." />
        <p role="alert" aria-live="polite" className="min-h-5 text-sm text-red-700">
          {state.error ?? ""}
        </p>
      </div>
    </form>
  );
}
