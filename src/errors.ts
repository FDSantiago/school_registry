import type { ErrorHandler, NotFoundHandler } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { AppEnv } from "./types";

// Throw this anywhere in a route or middleware; errorHandler turns it into the standard error response.
export class ApiError extends Error {
  constructor(
    public readonly status: ContentfulStatusCode,
    public readonly code: string,
    message: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

// The one error shape: {"error":{"code","message","details"?}}
export function errorBody(code: string, message: string, details?: Record<string, unknown>) {
  return { error: { code, message, ...(details ? { details } : {}) } };
}

export function errorHandler(log: (line: string) => void): ErrorHandler<AppEnv> {
  return (err, c) => {
    if (err instanceof ApiError) {
      return c.json(errorBody(err.code, err.message, err.details), err.status);
    }
    // Anything else is a bug or an outage (e.g. database down). Log it; tell the client nothing internal.
    const requestId = c.get("requestId");
    log(JSON.stringify({ level: "error", time: new Date().toISOString(), request_id: requestId, msg: "unhandled error", error: String(err) }));
    return c.json(
      errorBody("INTERNAL_ERROR", "An unexpected error occurred. Quote the request id when reporting it.", { request_id: requestId }),
      500,
    );
  };
}

export const notFoundHandler: NotFoundHandler<AppEnv> = (c) =>
  c.json(errorBody("NOT_FOUND", `No route for ${c.req.method} ${c.req.path}`), 404);
