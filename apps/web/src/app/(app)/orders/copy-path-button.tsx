"use client";

import { useState, type MouseEvent } from "react";

export function CopyPathButton({ path, label }: { path: string; label: string }) {
  const [copied, setCopied] = useState(false);

  async function copyPath(event: MouseEvent) {
    event.preventDefault();
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
