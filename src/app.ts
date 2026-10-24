import { Hono } from "hono";
import pkg from "../package.json" with { type: "json" };

// Builds the Hono app. index.ts serves it over HTTP; tests call app.request() directly.
export function createApp() {
  const app = new Hono();

  app.get("/health", (c) =>
    c.json({ status: "ok", version: pkg.version, time: new Date().toISOString() }),
  );

  return app;
}
