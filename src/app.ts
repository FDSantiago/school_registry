import { Hono } from "hono";
import pkg from "../package.json" with { type: "json" };
import type { Config } from "./config";
import type { Db } from "./db/connection";
import { errorHandler, notFoundHandler } from "./errors";
import { apiKeyAuth } from "./middleware/auth";
import { requestLogger } from "./middleware/logger";
import { rateLimit } from "./middleware/rate-limit";
import { requestId } from "./middleware/request-id";
import { sectionRoutes } from "./routes/sections";
import { studentRoutes } from "./routes/students";
import type { AppEnv } from "./types";

export type AppDeps = {
  db: Db;
  config: Pick<Config, "readKey" | "adminKey" | "rateLimitPerMinute">;
  log?: (line: string) => void; // tests capture log lines instead of printing them
  now?: () => number; // tests control the rate-limit clock
};

// Builds the Hono app. index.ts serves it over HTTP; tests call app.request() directly.
export function createApp({ db, config, log = console.log, now = Date.now }: AppDeps) {
  const app = new Hono<AppEnv>();

  // Runs for every request, in this order.
  app.use(requestId);
  app.use(requestLogger(log));

  app.get("/health", (c) =>
    c.json({ status: "ok", version: pkg.version, time: new Date().toISOString() }),
  );

  // Everything under /api/v1 needs a valid key and counts toward that key's rate limit.
  app.use("/api/v1/*", apiKeyAuth(config), rateLimit(config.rateLimitPerMinute, now));
  app.route("/api/v1", studentRoutes(db));
  app.route("/api/v1", sectionRoutes(db));

  app.notFound(notFoundHandler);
  app.onError(errorHandler(log));
  return app;
}
