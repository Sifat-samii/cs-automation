"use client";

import { useEffect, useState } from "react";

function formatRemaining(ms: number): { text: string; overdue: boolean } {
  const overdue = ms < 0;
  const abs = Math.abs(ms);
  const totalMinutes = Math.floor(abs / 60_000);
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;
  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0 || days > 0) parts.push(`${hours}h`);
  parts.push(`${minutes}m`);
  const text = overdue ? `Overdue ${parts.join(" ")}` : parts.join(" ");
  return { text, overdue };
}

export function TimeRemaining({ etaIso }: { etaIso: string | null | undefined }) {
  const [mounted, setMounted] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    setMounted(true);
    const id = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  if (!etaIso) {
    return <span className="text-slate-400">—</span>;
  }
  if (!mounted) {
    return <span className="text-slate-400">—</span>;
  }

  const etaMs = Date.parse(etaIso);
  if (Number.isNaN(etaMs)) {
    return <span className="text-slate-400">—</span>;
  }

  const { text, overdue } = formatRemaining(etaMs - now);
  return <span className={overdue ? "font-medium text-rose-700" : "text-slate-700"}>{text}</span>;
}
