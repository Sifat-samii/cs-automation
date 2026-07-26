"use client";

import { RouteError } from "@/app/(app)/_components/route-error";

export default function NewClientError(props: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  return <RouteError {...props} />;
}
