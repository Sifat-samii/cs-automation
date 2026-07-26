"use client";

import { useActionState, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  confirmManualDropAction,
  retryTransferAction,
  startTransferAction,
  type OrderActionState,
} from "@/app/(app)/orders/actions";
import { SubmitButton } from "@/app/(app)/_components/submit-button";

const PIPELINE = [
  ["DOWNLOAD", "Download"],
  ["STAGE_VERIFY", "Stage and verify"],
  ["WRITE_BACKUP", "Write backup"],
  ["COPY_PRODUCTION", "Copy production"],
  ["VERIFY_PRODUCTION", "Verify production"],
] as const;

export type TransferJobView = {
  id: string;
  kind: (typeof PIPELINE)[number][0];
  status: "QUEUED" | "LEASED" | "SUCCEEDED" | "FAILED";
  attempts: number;
  maxAttempts: number;
  bytesDone: number;
  bytesTotal: number;
  lastError: string | null;
  errorClass: "TRANSIENT" | "PERMANENT" | null;
};

const initialState: OrderActionState = { error: null };

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KiB", "MiB", "GiB", "TiB"] as const;
  let value = bytes / 1024;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  return `${value.toFixed(value >= 10 ? 1 : 2)} ${units[index]}`;
}

function ActionError({ error }: OrderActionState) {
  return (
    <p role="alert" aria-live="polite" className="mt-2 min-h-5 text-xs text-red-700">
      {error ?? ""}
    </p>
  );
}

export function TransferMonitor({
  orderId,
  batchId,
  batchStatus,
  manualDropPath,
  jobs,
}: {
  orderId: string;
  batchId: string;
  batchStatus: string;
  manualDropPath: string;
  jobs: readonly TransferJobView[];
}) {
  const router = useRouter();
  const [, startRefreshTransition] = useTransition();
  const [startState, startAction] = useActionState(startTransferAction, initialState);
  const [retryState, retryAction] = useActionState(retryTransferAction, initialState);
  const [manualState, manualAction] = useActionState(confirmManualDropAction, initialState);
  const isActive = jobs.some((job) => job.status === "QUEUED" || job.status === "LEASED");

  useEffect(() => {
    if (!isActive) return;
    const timer = window.setInterval(() => {
      startRefreshTransition(() => router.refresh());
    }, 5_000);
    return () => window.clearInterval(timer);
  }, [isActive, router]);

  const current =
    [...jobs].reverse().find((job) => job.status !== "SUCCEEDED") ?? jobs.at(-1) ?? null;
  const progress =
    current && current.bytesTotal > 0
      ? Math.min(100, Math.round((current.bytesDone / current.bytesTotal) * 100))
      : 0;
  const permanentDownloadFailure = jobs.some(
    (job) => job.kind === "DOWNLOAD" && job.status === "FAILED" && job.errorClass === "PERMANENT",
  );
  const failedJob = jobs.find((job) => job.status === "FAILED") ?? null;

  return (
    <div className="mt-4 border-t border-slate-200 pt-4">
      {batchStatus === "FAILED" && failedJob && (
        <div
          role="alert"
          className="mb-4 rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-950"
        >
          <p className="font-semibold">Download / transfer failed</p>
          <p className="mt-1">
            Stage <span className="font-mono">{failedJob.kind}</span>
            {failedJob.errorClass ? ` (${failedJob.errorClass})` : ""}:{" "}
            {failedJob.lastError ?? "No error details recorded."}
          </p>
          <p className="mt-2 text-xs text-red-800">
            Retry the transfer below, or use manual drop when the download failure is permanent.
          </p>
        </div>
      )}

      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Transfer pipeline
        </p>
        {isActive && (
          <span className="text-xs font-medium text-indigo-700">Refreshes every 5s</span>
        )}
      </div>

      <ol className="mt-3 space-y-2">
        {PIPELINE.map(([kind, label]) => {
          const job = jobs.find((candidate) => candidate.kind === kind);
          return (
            <li key={kind} className="flex items-center justify-between gap-3 text-xs">
              <span className="text-slate-700">{label}</span>
              <span
                className={
                  job?.status === "FAILED"
                    ? "font-semibold text-red-700"
                    : job?.status === "SUCCEEDED"
                      ? "font-semibold text-emerald-700"
                      : job?.status === "LEASED"
                        ? "font-semibold text-indigo-700"
                        : "font-medium text-slate-500"
                }
              >
                {job?.status ?? "WAITING"}
                {job ? ` · ${job.attempts}/${job.maxAttempts}` : ""}
              </span>
            </li>
          );
        })}
      </ol>

      {current && (
        <div className="mt-4" aria-live="polite">
          <div className="flex justify-between text-xs text-slate-600">
            <span>{current.kind.replaceAll("_", " ")}</span>
            <span>
              {formatBytes(current.bytesDone)} / {formatBytes(current.bytesTotal)}
            </span>
          </div>
          <progress
            className="mt-1 h-2 w-full accent-indigo-600"
            max={100}
            value={progress}
            aria-label={`${current.kind.replaceAll("_", " ")} progress`}
          />
          {current.lastError && (
            <p className="mt-2 rounded bg-red-50 px-3 py-2 text-xs text-red-800">
              {current.errorClass}: {current.lastError}
            </p>
          )}
        </div>
      )}

      {batchStatus === "PENDING" && jobs.length === 0 && (
        <form action={startAction} className="mt-4">
          <input type="hidden" name="orderId" value={orderId} />
          <input type="hidden" name="batchId" value={batchId} />
          <SubmitButton
            label="Start transfer"
            pendingLabel="Queuing transfer..."
            className="w-full"
          />
          <ActionError error={startState.error} />
        </form>
      )}

      {batchStatus === "FAILED" && (
        <form action={retryAction} className="mt-4">
          <input type="hidden" name="orderId" value={orderId} />
          <input type="hidden" name="batchId" value={batchId} />
          <SubmitButton label="Retry transfer" pendingLabel="Queuing retry..." className="w-full" />
          <ActionError error={retryState.error} />
        </form>
      )}

      {batchStatus === "FAILED" && permanentDownloadFailure && (
        <form
          action={manualAction}
          className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3"
        >
          <input type="hidden" name="orderId" value={orderId} />
          <input type="hidden" name="batchId" value={batchId} />
          <p className="text-xs text-amber-900">
            Place the complete batch in <code className="font-mono">{manualDropPath}</code>, then
            confirm. The agent will not read it before this explicit confirmation.
          </p>
          <SubmitButton
            label="Confirm manual drop and retry"
            pendingLabel="Confirming manual drop..."
            className="mt-3 w-full"
          />
          <ActionError error={manualState.error} />
        </form>
      )}
    </div>
  );
}
