"use client";

import { RouteError } from "@/app/(app)/_components/route-error";

export default function InboxDetailError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  return <RouteError error={error} unstable_retry={unstable_retry} />;
}
