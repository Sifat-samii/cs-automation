type RateBucket = {
  startedAt: number;
  count: number;
};

const WINDOW_MILLISECONDS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 60;
const buckets = new Map<string, RateBucket>();

export function checkIngestRateLimit(
  caller: string,
  now: number = Date.now(),
): { allowed: true } | { allowed: false; retryAfterSeconds: number } {
  const existing = buckets.get(caller);
  if (!existing || now - existing.startedAt >= WINDOW_MILLISECONDS) {
    buckets.set(caller, { startedAt: now, count: 1 });
    return { allowed: true };
  }
  if (existing.count >= MAX_REQUESTS_PER_WINDOW) {
    return {
      allowed: false,
      retryAfterSeconds: Math.max(
        1,
        Math.ceil((WINDOW_MILLISECONDS - (now - existing.startedAt)) / 1_000),
      ),
    };
  }
  existing.count += 1;
  return { allowed: true };
}

export function resetIngestRateLimitsForTesting(): void {
  buckets.clear();
}
