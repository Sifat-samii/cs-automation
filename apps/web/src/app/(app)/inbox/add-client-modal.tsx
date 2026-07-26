"use client";

import { useActionState, useMemo, useState } from "react";
import { deriveClientCode } from "@cs/shared/client-code";
import {
  createClientFromInboxAction,
  type InboxClientActionState,
} from "@/app/(app)/inbox/actions";
import { SubmitButton } from "@/app/(app)/_components/submit-button";

const initialState: InboxClientActionState = { error: null };

export function AddClientModal({
  emailMessageId,
  fromAddress,
  suggestedDisplayName,
}: {
  emailMessageId: string;
  fromAddress: string;
  suggestedDisplayName?: string;
}) {
  const [open, setOpen] = useState(false);
  const [displayName, setDisplayName] = useState(suggestedDisplayName ?? "");
  const suggestedCode = useMemo(
    () => (displayName.trim() ? deriveClientCode(displayName) : ""),
    [displayName],
  );
  const [state, action] = useActionState(createClientFromInboxAction, initialState);

  return (
    <div className="mt-2 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-900">
          New client
        </span>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-50"
        >
          Add new client
        </button>
      </div>

      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="add-client-title"
        >
          <div className="w-full max-w-lg rounded-xl border border-slate-200 bg-white p-5 shadow-lg">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 id="add-client-title" className="font-semibold text-slate-950">
                  Add new client
                </h3>
                <p className="mt-1 text-sm text-slate-600">
                  Registers the sender and creates their share folder from the display name when
                  needed.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-sm font-semibold text-slate-500 hover:text-slate-800"
              >
                Close
              </button>
            </div>

            <form action={action} className="mt-4 space-y-3">
              <input type="hidden" name="emailMessageId" value={emailMessageId} />
              <label className="block space-y-1 text-sm font-medium text-slate-700">
                Display name
                <input
                  name="displayName"
                  required
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2"
                />
              </label>
              <label className="block space-y-1 text-sm font-medium text-slate-700">
                Code
                <input
                  name="code"
                  defaultValue={suggestedCode}
                  key={suggestedCode}
                  pattern="[A-Za-z0-9]{2,12}"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono uppercase"
                />
              </label>
              <label className="block space-y-1 text-sm font-medium text-slate-700">
                Sender address
                <input
                  name="address"
                  type="email"
                  defaultValue={fromAddress}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2"
                />
              </label>
              <SubmitButton label="Create client" pendingLabel="Creating..." />
              <p role="alert" aria-live="polite" className="min-h-5 text-sm text-red-700">
                {state.error ?? ""}
              </p>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
