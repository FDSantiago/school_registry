import { createMiddleware } from "hono/factory";
import type { AppEnv } from "../types";

// Accept the caller's X-Request-Id if it is a sane token (so it cannot inject text into logs), otherwise make one.
const VALID_REQUEST_ID = /^[A-Za-z0-9._:-]{1,128}$/;

export const requestId = createMiddleware<AppEnv>(async (c, next) => {
  const incoming = c.req.header("x-request-id");
  const id = incoming && VALID_REQUEST_ID.test(incoming) ? incoming : crypto.randomUUID();
  c.set("requestId", id);
  c.header("X-Request-Id", id);
  await next();
});
