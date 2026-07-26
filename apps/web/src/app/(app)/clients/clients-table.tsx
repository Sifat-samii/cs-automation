"use client";

import { useState, type MouseEvent } from "react";

function CopyPathButton({ path, label }: { path: string; label: string }) {
  const [copied, setCopied] = useState(false);

  async function copyPath(event: MouseEvent) {
    event.stopPropagation();
    try {
      await navigator.clipboard.writeText(path);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }

  return (
    <button
      type="button"
      onClick={copyPath}
      title={`Copy ${label}`}
      aria-label={`Copy ${label}`}
      className="inline-flex shrink-0 items-center rounded border border-slate-300 bg-white px-1.5 py-0.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
    >
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

export type ClientTableOrder = {
  id: string;
  title: string;
  createdAt: string;
  eta: string | null;
  status: string;
  quantity: number | null;
  backupPath: string;
};

export type ClientTableRow = {
  id: string;
  code: string;
  displayName: string;
  folderName: string;
  folderPath: string;
  unassigned: number;
  inProduction: number;
  past: number;
  orders: readonly ClientTableOrder[];
};

function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function ClientsTable({ clients }: { clients: readonly ClientTableRow[] }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = clients.find((client) => client.id === selectedId) ?? null;

  return (
    <>
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3 font-semibold">Code</th>
              <th className="px-4 py-3 font-semibold">Name</th>
              <th className="px-4 py-3 font-semibold">Folder path</th>
              <th className="px-4 py-3 font-semibold">Unassigned</th>
              <th className="px-4 py-3 font-semibold">In production</th>
              <th className="px-4 py-3 font-semibold">Past</th>
            </tr>
          </thead>
          <tbody>
            {clients.map((client) => (
              <tr
                key={client.id}
                tabIndex={0}
                role="button"
                onClick={() => setSelectedId(client.id)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    setSelectedId(client.id);
                  }
                }}
                className="cursor-pointer border-b border-slate-100 last:border-0 hover:bg-slate-50"
              >
                <td className="px-4 py-3 font-mono text-xs font-bold text-indigo-700">
                  {client.code}
                </td>
                <td className="px-4 py-3 font-medium text-slate-950">{client.displayName}</td>
                <td className="px-4 py-3">
                  <div className="flex max-w-md items-start gap-2">
                    <span className="break-all text-xs text-slate-600">{client.folderPath}</span>
                    <CopyPathButton path={client.folderPath} label="client folder path" />
                  </div>
                </td>
                <td className="px-4 py-3 text-slate-800">{client.unassigned}</td>
                <td className="px-4 py-3 text-slate-800">{client.inProduction}</td>
                <td className="px-4 py-3 text-slate-800">{client.past}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selected ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="client-orders-title"
          onClick={() => setSelectedId(null)}
        >
          <div
            className="max-h-[85vh] w-full max-w-5xl overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
              <div>
                <p className="font-mono text-xs font-bold text-indigo-700">{selected.code}</p>
                <h2 id="client-orders-title" className="text-lg font-semibold text-slate-950">
                  {selected.displayName}
                </h2>
                <p className="mt-1 text-sm text-slate-600">
                  Folder {selected.folderName} · {selected.orders.length} order
                  {selected.orders.length === 1 ? "" : "s"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedId(null)}
                className="text-sm font-semibold text-slate-500 hover:text-slate-800"
              >
                Close
              </button>
            </div>
            <div className="max-h-[70vh] overflow-auto p-5">
              {selected.orders.length === 0 ? (
                <p className="text-sm text-slate-500">No orders for this client.</p>
              ) : (
                <table className="min-w-full text-left text-sm">
                  <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="py-2 pr-3 font-semibold">Order name</th>
                      <th className="py-2 pr-3 font-semibold">Placed</th>
                      <th className="py-2 pr-3 font-semibold">ETA</th>
                      <th className="py-2 pr-3 font-semibold">Status</th>
                      <th className="py-2 pr-3 font-semibold">Folder path</th>
                      <th className="py-2 font-semibold">Qty</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selected.orders.map((order) => (
                      <tr key={order.id} className="border-b border-slate-100 last:border-0">
                        <td className="py-3 pr-3 font-medium text-slate-900">{order.title}</td>
                        <td className="py-3 pr-3 text-slate-700">{formatDate(order.createdAt)}</td>
                        <td className="py-3 pr-3 text-slate-700">
                          {order.eta ? formatDate(order.eta) : "—"}
                        </td>
                        <td className="py-3 pr-3">
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">
                            {order.status}
                          </span>
                        </td>
                        <td className="py-3 pr-3">
                          <div className="flex max-w-sm items-start gap-2">
                            <span className="break-all text-xs text-slate-600">
                              {order.backupPath}
                            </span>
                            <CopyPathButton path={order.backupPath} label="order folder path" />
                          </div>
                        </td>
                        <td className="py-3 text-slate-800">{order.quantity ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
