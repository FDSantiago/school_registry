import { createMiddleware } from "hono/factory";
import { ApiError } from "../errors";
import type { AppEnv } from "../types";

const WINDOW_MS = 60_000;

// Fixed one-minute window per API key, kept in memory (resets when the server restarts).
// There is exactly one key per role, so the role identifies the key without storing the key itself.
export function rateLimit(limitPerMinute: number, now: () => number = Date.now) {
  const windows = new Map<string, { start: number; count: number }>();

  return createMiddleware<AppEnv>(async (c, next) => {
    const client = c.get("role");
    const t = now();
    let w = windows.get(client);
    if (!w || t - w.start >= WINDOW_MS) {
      w = { start: t, count: 0 };
      windows.set(client, w);
    }
    w.count++;

    c.header("X-RateLimit-Limit", String(limitPerMinute));
    c.header("X-RateLimit-Remaining", String(Math.max(0, limitPerMinute - w.count)));

    if (w.count > limitPerMinute) {
      const retryAfter = Math.ceil((w.start + WINDOW_MS - t) / 1000);
      c.header("Retry-After", String(retryAfter));
      throw new ApiError(429, "RATE_LIMITED", `Too many requests: the limit is ${limitPerMinute} per minute`, {
        retry_after_seconds: retryAfter,
      });
    }
    await next();
  });
}
