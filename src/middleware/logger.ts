import { createMiddleware } from "hono/factory";
import type { AppEnv } from "../types";

// One JSON line per request. "client" is the key's role (read/admin), never the key itself.
export function requestLogger(log: (line: string) => void) {
  return createMiddleware<AppEnv>(async (c, next) => {
    const start = performance.now();
    await next();
    const url = new URL(c.req.url);
    log(
      JSON.stringify({
        level: "info",
        time: new Date().toISOString(),
        request_id: c.get("requestId"),
        method: c.req.method,
        path: url.pathname,
        query: url.search || undefined,
        status: c.res.status,
        ms: Math.round((performance.now() - start) * 10) / 10,
        client: c.get("role") ?? null,
      }),
    );
  });
}
