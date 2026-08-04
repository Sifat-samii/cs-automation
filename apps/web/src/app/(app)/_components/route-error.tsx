"use client";

export function RouteError({
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  return (
    <div role="alert" className="min-h-48 rounded-xl border border-red-200 bg-red-50 p-6">
      <h2 className="text-base font-semibold text-red-950">This page could not be loaded</h2>
      <p className="mt-2 max-w-xl text-sm text-red-800">
        Try loading it again. If the problem continues, contact the CS lead with the page you were
        opening.
      </p>
      <button
        type="button"
        onClick={() => unstable_retry()}
        className="mt-5 rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-semibold text-red-900"
      >
        Try again
      </button>
    </div>
  );
}
