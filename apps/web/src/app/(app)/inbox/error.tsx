"use client";

import { RouteError } from "@/app/(app)/_components/route-error";

export default function InboxError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  return <RouteError error={error} unstable_retry={unstable_retry} />;
}
