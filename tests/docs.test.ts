// Keeps the documentation truthful:
//  - every example in docs/openapi.yaml is one recorded in docs/examples.json (by `bun run docs`)
//  - every recorded example is still what the app returns today
//  - every route the app serves is documented
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import type { Captured } from "../scripts/build-docs";
import type { Db } from "../src/db/connection";
import { resetAndSeed } from "../src/db/seed";
import { ADMIN_KEY, makeApp, READ_KEY } from "./helpers/app";
import { openTestDb } from "./helpers/db";

const examples: Captured[] = await Bun.file(new URL("../docs/examples.json", import.meta.url)).json();
const spec = Bun.YAML.parse(await Bun.file(new URL("../docs/openapi.yaml", import.meta.url)).text()) as any;
const captured = new Map(examples.map((e) => [e.name, e]));

// Timestamps and generated request ids differ between runs; everything else must match exactly.
function normalize(value: unknown): string {
  return JSON.stringify(value)
    .replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/g, "<time>")
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, "<uuid>");
}

// Collects every named example in the spec: { name, value }.
function specExamples(node: unknown, found: { name: string; value: unknown }[] = []) {
  if (node && typeof node === "object") {
    for (const [key, child] of Object.entries(node)) {
      if (key === "examples" && child && typeof child === "object") {
        for (const [name, ex] of Object.entries(child)) found.push({ name, value: (ex as { value: unknown }).value });
      } else {
        specExamples(child, found);
      }
    }
  }
  return found;
}

describe("docs/openapi.yaml", () => {
  const found = specExamples(spec);

  it("documents every route", () => {
    expect(Object.keys(spec.paths).sort()).toEqual([
      "/api/v1/sections/{section}/students",
      "/api/v1/students",
      "/api/v1/students/{student_id}",
      "/health",
    ]);
    expect(Object.keys(spec.paths["/api/v1/students/{student_id}"]).sort()).toEqual(["delete", "get", "parameters", "put"]);
  });

  it("only uses recorded examples, unchanged", () => {
    expect(found.length).toBeGreaterThan(15);
    for (const { name, value } of found) {
      const rec = captured.get(name);
      expect(rec, `example "${name}" is not in docs/examples.json`).toBeDefined();
      expect(normalize(value)).toBe(normalize(rec!.response.body));
    }
  });

  it("includes every recorded example except near-duplicates", () => {
    const notInSpec = ["roster", "roster_xml_format", "route_not_found", "delete_student", "update_student_not_found", "delete_student_not_found"];
    const names = new Set(found.map((f) => f.name));
    for (const e of examples) if (!notInSpec.includes(e.name)) expect(names.has(e.name), e.name).toBe(true);
  });
});

describe("docs/examples.json still matches the app", () => {
  let db: Db;
  beforeAll(async () => {
    db = await openTestDb();
    await resetAndSeed(db);
  });
  afterAll(async () => {
    await db.close();
  });

  it("replays every recorded request and gets the same response", async () => {
    const { app } = makeApp(db);
    const keyValues: Record<string, string> = { "{{readKey}}": READ_KEY, "{{adminKey}}": ADMIN_KEY };
    // rate_limited and internal_error need special setups; they are covered in api.middleware.test.ts.
    for (const e of examples.filter((x) => x.name !== "rate_limited" && x.name !== "internal_error")) {
      const headers = Object.fromEntries(
        Object.entries(e.request.headers).map(([k, v]) => [k, keyValues[v] ?? v]),
      );
      const res = await app.request(e.request.path, { method: e.request.method, headers, body: e.request.body });
      const text = await res.text();
      const body = (res.headers.get("content-type") ?? "").includes("json") ? JSON.parse(text) : text || null;

      expect(`${e.name}: ${res.status}`).toBe(`${e.name}: ${e.response.status}`);
      expect(res.headers.get("content-type") ?? undefined).toBe(e.response.headers["content-type"]);
      expect(res.headers.get("location") ?? undefined).toBe(e.response.headers.location);
      expect(normalize(body)).toBe(normalize(e.response.body));
    }
  });
});
