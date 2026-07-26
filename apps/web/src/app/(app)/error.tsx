"use client";

export default function ErrorState({ reset }: { error: Error; reset: () => void }) {
  return (
    <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-6">
      <h2 className="text-sm font-semibold text-red-900">Something went wrong</h2>
      <p className="mt-1 text-sm text-red-700">
        The page could not be loaded. If this keeps happening, contact the CS lead.
      </p>
      <button
        type="button"
        onClick={reset}
        className="mt-4 rounded-md border border-red-300 px-3 py-1 text-sm text-red-900"
      >
        Try again
      </button>
    </div>
  );
}
