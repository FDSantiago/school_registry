import { createHash, timingSafeEqual } from "node:crypto";
import { createMiddleware } from "hono/factory";
import { ApiError } from "../errors";
import type { AppEnv } from "../types";

// Constant-time comparison: hashing first gives both sides the same length, which timingSafeEqual requires.
function sameKey(given: string, expected: string): boolean {
  const a = createHash("sha256").update(given).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

// Checks X-API-Key and records the role: 401 if it is missing or unknown.
export function apiKeyAuth(keys: { readKey: string; adminKey: string }) {
  return createMiddleware<AppEnv>(async (c, next) => {
    const key = c.req.header("x-api-key");
    if (!key) throw new ApiError(401, "UNAUTHORIZED", "Missing X-API-Key header");

    const isAdmin = sameKey(key, keys.adminKey);
    const isRead = sameKey(key, keys.readKey);
    if (isAdmin) c.set("role", "admin");
    else if (isRead) c.set("role", "read");
    else throw new ApiError(401, "UNAUTHORIZED", "Invalid API key");

    await next();
  });
}

// For write endpoints: a valid read key gets 403.
export const requireAdmin = createMiddleware<AppEnv>(async (c, next) => {
  if (c.get("role") !== "admin") {
    throw new ApiError(403, "FORBIDDEN", "This endpoint requires the admin API key");
  }
  await next();
});
