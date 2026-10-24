import { afterAll, beforeAll, beforeEach, describe, expect, it } from "bun:test";
import { createApp } from "../src/app";
import type { Db } from "../src/db/connection";
import { resetAndSeed } from "../src/db/seed";
import { ADMIN_KEY, makeApp, READ_KEY, withKey } from "./helpers/app";
import { openTestDb } from "./helpers/db";

let db: Db;

beforeAll(async () => {
  db = await openTestDb();
  await resetAndSeed(db);
});
afterAll(async () => {
  await db.close();
});

describe("X-Request-Id", () => {
  it("echoes the caller's request id", async () => {
    const { app } = makeApp(db);
    const res = await app.request("/health", { headers: { "X-Request-Id": "demo-123" } });
    expect(res.headers.get("x-request-id")).toBe("demo-123");
  });

  it("generates a UUID when absent or unsafe, including on error responses", async () => {
    const { app } = makeApp(db);
    const absent = await app.request("/api/v1/students/2026-00101");
    expect(absent.status).toBe(401);
    expect(absent.headers.get("x-request-id")).toMatch(/^[0-9a-f-]{36}$/);
    const unsafe = await app.request("/health", { headers: { "X-Request-Id": 'bad id","level":"fake' } });
    expect(unsafe.headers.get("x-request-id")).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe("request logging", () => {
  it("writes one JSON line per request with method, path, status, ms, request id and role", async () => {
    const { app, logs } = makeApp(db);
    await app.request("/api/v1/students/2026-00101", withKey(READ_KEY, { "X-Request-Id": "log-test" }));
    expect(logs).toHaveLength(1);
    expect(JSON.parse(logs[0]!)).toEqual({
      level: "info",
      time: expect.any(String),
      request_id: "log-test",
      method: "GET",
      path: "/api/v1/students/2026-00101",
      status: 200,
      ms: expect.any(Number),
      client: "read",
    });
  });

  it("never logs API key values, valid or not", async () => {
    const { app, logs } = makeApp(db);
    await app.request("/api/v1/students/2026-00101", withKey(READ_KEY));
    await app.request("/api/v1/students/2026-00101", withKey(ADMIN_KEY));
    await app.request("/api/v1/students/2026-00101", withKey("guessed-key-0123456789"));
    const all = logs.join("\n");
    expect(logs).toHaveLength(3);
    expect(all).not.toContain(READ_KEY);
    expect(all).not.toContain(ADMIN_KEY);
    expect(all).not.toContain("guessed-key");
  });
});

describe("rate limiting", () => {
  it("returns 429 with Retry-After after the limit, and resets after a minute", async () => {
    let clock = 1_000_000;
    const { app } = makeApp(db, { rateLimitPerMinute: 3, now: () => clock });
    const get = () => app.request("/api/v1/students/2026-00101", withKey(READ_KEY));

    for (let i = 0; i < 3; i++) expect((await get()).status).toBe(200);

    clock += 20_000;
    const limited = await get();
    expect(limited.status).toBe(429);
    expect(limited.headers.get("retry-after")).toBe("40");
    expect(await limited.json()).toEqual({
      error: {
        code: "RATE_LIMITED",
        message: "Too many requests: the limit is 3 per minute",
        details: { retry_after_seconds: 40 },
      },
    });

    clock += 40_000;
    expect((await get()).status).toBe(200);
  });

  it("counts each key separately and reports remaining requests", async () => {
    const { app } = makeApp(db, { rateLimitPerMinute: 1 });
    expect((await app.request("/api/v1/students/2026-00101", withKey(READ_KEY))).status).toBe(200);
    expect((await app.request("/api/v1/students/2026-00101", withKey(READ_KEY))).status).toBe(429);
    const admin = await app.request("/api/v1/students/2026-00101", withKey(ADMIN_KEY));
    expect(admin.status).toBe(200);
    expect(admin.headers.get("x-ratelimit-limit")).toBe("1");
    expect(admin.headers.get("x-ratelimit-remaining")).toBe("0");
  });

  it("does not limit /health", async () => {
    const { app } = makeApp(db, { rateLimitPerMinute: 1 });
    for (let i = 0; i < 3; i++) expect((await app.request("/health")).status).toBe(200);
  });
});

describe("error handling", () => {
  it("returns 404 NOT_FOUND in the standard shape for unknown routes", async () => {
    const { app } = makeApp(db);
    const res = await app.request("/nope");
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: { code: "NOT_FOUND", message: "No route for GET /nope" } });
  });

  it("returns 500 without leaking internals, and logs the real error", async () => {
    // A fake database that fails like a broken connection would.
    const brokenDb = (() => {
      throw new Error("connect ECONNREFUSED 10.0.0.5:3306 password=hunter2");
    }) as unknown as Db;
    const logs: string[] = [];
    const app = createApp({
      db: brokenDb,
      config: { readKey: READ_KEY, adminKey: ADMIN_KEY, rateLimitPerMinute: 100 },
      log: (l) => logs.push(l),
    });
    const res = await app.request("/api/v1/students/2026-00101", withKey(READ_KEY, { "X-Request-Id": "boom-1" }));
    expect(res.status).toBe(500);
    const text = await res.text();
    expect(JSON.parse(text)).toEqual({
      error: {
        code: "INTERNAL_ERROR",
        message: "An unexpected error occurred. Quote the request id when reporting it.",
        details: { request_id: "boom-1" },
      },
    });
    expect(text).not.toContain("ECONNREFUSED");
    expect(logs.some((l) => l.includes("ECONNREFUSED") && l.includes('"level":"error"'))).toBe(true);
  });
});
