import { describe, expect, it } from "bun:test";
import { createApp } from "../src/app";
import pkg from "../package.json" with { type: "json" };

describe("GET /health", () => {
  it("returns status, version and time without an API key", async () => {
    const res = await createApp().request("/health");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ status: "ok", version: pkg.version, time: expect.any(String) });
    expect(Number.isNaN(Date.parse(body.time))).toBe(false);
  });
});
