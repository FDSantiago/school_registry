import { describe, expect, it } from "bun:test";
import { loadConfig } from "../src/config";

const valid = {
  DATABASE_URL: "mysql://u:p@localhost:3306/db",
  REGISTRY_READ_KEY: "read-key-0123456789",
  REGISTRY_ADMIN_KEY: "admin-key-0123456789",
};

describe("loadConfig", () => {
  it("applies defaults for PORT and RATE_LIMIT_PER_MINUTE", () => {
    const c = loadConfig(valid);
    expect(c.port).toBe(4000);
    expect(c.rateLimitPerMinute).toBe(60);
  });

  it("rejects identical read and admin keys", () => {
    expect(() => loadConfig({ ...valid, REGISTRY_ADMIN_KEY: valid.REGISTRY_READ_KEY })).toThrow(
      "must be different",
    );
  });

  it("names the bad setting but never prints key values", () => {
    try {
      loadConfig({ ...valid, REGISTRY_READ_KEY: "short-secret" });
      throw new Error("expected loadConfig to throw");
    } catch (e) {
      const message = (e as Error).message;
      expect(message).toContain("REGISTRY_READ_KEY");
      expect(message).not.toContain("short-secret");
    }
  });
});
