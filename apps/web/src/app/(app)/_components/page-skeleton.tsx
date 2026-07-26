export function PageSkeleton({ label }: { label: string }) {
  return (
    <div className="min-h-72 space-y-5" aria-busy="true" aria-live="polite" aria-label={label}>
      <div className="h-8 w-52 animate-pulse rounded-lg bg-slate-200" />
      <div className="h-4 w-80 max-w-full animate-pulse rounded bg-slate-200" />
      <div className="grid gap-4 pt-3 md:grid-cols-2">
        <div className="h-36 animate-pulse rounded-xl bg-slate-200" />
        <div className="h-36 animate-pulse rounded-xl bg-slate-200" />
      </div>
    </div>
  );
}
