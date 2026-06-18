/**
 * Simple in-memory rate limiter for LLM-calling API endpoints.
 * For a single-user workbench this is sufficient; scale with Redis if needed.
 */

const store = new Map<string, { count: number; resetAt: number }>();

/* Clean up expired entries periodically (every 60s). */
if (typeof setInterval !== "undefined") {
  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of store) {
      if (entry.resetAt <= now) store.delete(key);
    }
  }, 60_000);
}

/**
 * Returns true if the request should be allowed, false if rate-limited.
 * @param key — unique identifier (e.g. `chat:${userId}`)
 * @param maxRequests — max requests in the window
 * @param windowMs — time window in milliseconds (default 60s)
 */
export function checkRateLimit(
  key: string,
  maxRequests: number,
  windowMs = 60_000,
): { allowed: boolean; remaining: number; resetAt: number } {
  const now = Date.now();
  let entry = store.get(key);

  if (!entry || entry.resetAt <= now) {
    entry = { count: 1, resetAt: now + windowMs };
    store.set(key, entry);
    return { allowed: true, remaining: maxRequests - 1, resetAt: entry.resetAt };
  }

  entry.count += 1;

  if (entry.count > maxRequests) {
    return { allowed: false, remaining: 0, resetAt: entry.resetAt };
  }

  return { allowed: true, remaining: maxRequests - entry.count, resetAt: entry.resetAt };
}
