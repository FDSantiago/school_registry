import { afterAll, beforeAll, beforeEach, describe, expect, it } from "bun:test";
import type { Db } from "../src/db/connection";
import { resetAndSeed } from "../src/db/seed";
import { makeApp, READ_KEY, sendJson, validStudent, withKey } from "./helpers/app";
import { openTestDb } from "./helpers/db";

let db: Db;
let app: ReturnType<typeof makeApp>["app"];

beforeAll(async () => {
  db = await openTestDb();
});
afterAll(async () => {
  await db.close();
});
beforeEach(async () => {
  await resetAndSeed(db);
  app = makeApp(db).app;
});

describe("GET /api/v1/sections/:section/students (JSON)", () => {
  it("returns the roster sorted by last name, with count", async () => {
    const res = await app.request("/api/v1/sections/IT1A/students", withKey(READ_KEY));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.section).toBe("IT1A");
    expect(body.count).toBe(9);
    expect(body.students).toHaveLength(9);
    expect(body.students[0].last_name).toBe("Aquino");
    expect(body.students.map((s: { status: string }) => s.status)).toContain("Inactive");
  });

  it("matches the section in any case and returns it as stored", async () => {
    const res = await app.request("/api/v1/sections/it1a/students", withKey(READ_KEY));
    expect(res.status).toBe(200);
    expect((await res.json()).section).toBe("IT1A");
  });

  it("filters by ?status=", async () => {
    const res = await app.request("/api/v1/sections/IT1A/students?status=Inactive", withKey(READ_KEY));
    const body = await res.json();
    expect(body.count).toBe(1);
    expect(body.students[0].student_id).toBe("2026-00109");
  });

  it("returns 200 with count 0 when the section exists but no one has that status", async () => {
    const res = await app.request("/api/v1/sections/IT1A/students?status=Graduated", withKey(READ_KEY));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ section: "IT1A", count: 0, students: [] });
  });

  it("returns 422 for an unknown status value", async () => {
    const res = await app.request("/api/v1/sections/IT1A/students?status=Dropped", withKey(READ_KEY));
    expect(res.status).toBe(422);
    expect((await res.json()).error.details.fields[0].field).toBe("status");
  });

  it("returns 404 SECTION_NOT_FOUND for a section with no students", async () => {
    const res = await app.request("/api/v1/sections/ZZ9Z/students", withKey(READ_KEY));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({
      error: { code: "SECTION_NOT_FOUND", message: "No students found in section ZZ9Z" },
    });
  });

  it("requires an API key", async () => {
    const res = await app.request("/api/v1/sections/IT1A/students");
    expect(res.status).toBe(401);
  });
});

describe("GET /api/v1/sections/:section/students (XML)", () => {
  it("returns XML when Accept: application/xml", async () => {
    const res = await app.request("/api/v1/sections/CS4A/students", withKey(READ_KEY, { Accept: "application/xml" }));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/xml; charset=utf-8");
    const xml = await res.text();
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>\n<roster>\n  <section>CS4A</section>\n  <count>7</count>')).toBe(true);
    expect(xml.match(/<student>/g)).toHaveLength(7);
    expect(xml.trimEnd().endsWith("</roster>")).toBe(true);
  });

  it("returns XML for ?format=xml, and ?format=json overrides the Accept header", async () => {
    const xml = await app.request("/api/v1/sections/CS4A/students?format=xml", withKey(READ_KEY));
    expect(xml.headers.get("content-type")).toContain("application/xml");
    const json = await app.request(
      "/api/v1/sections/CS4A/students?format=json",
      withKey(READ_KEY, { Accept: "application/xml" }),
    );
    expect(json.headers.get("content-type")).toContain("application/json");
  });

  it("escapes & < > ' \" in names", async () => {
    await app.request(
      "/api/v1/students",
      sendJson("POST", { ...validStudent, section: "XML1", first_name: `Tom & "Jerry"`, last_name: "<O'Neil>" }),
    );
    const res = await app.request("/api/v1/sections/XML1/students?format=xml", withKey(READ_KEY));
    const xml = await res.text();
    expect(xml).toContain("<first_name>Tom &amp; &quot;Jerry&quot;</first_name>");
    expect(xml).toContain("<last_name>&lt;O&apos;Neil&gt;</last_name>");
    expect(xml).not.toContain("<O'Neil>");
  });

  it("returns 422 for an unknown ?format=", async () => {
    const res = await app.request("/api/v1/sections/CS4A/students?format=csv", withKey(READ_KEY));
    expect(res.status).toBe(422);
  });

  it("keeps errors in JSON even when XML was requested", async () => {
    const res = await app.request("/api/v1/sections/ZZ9Z/students?format=xml", withKey(READ_KEY));
    expect(res.status).toBe(404);
    expect((await res.json()).error.code).toBe("SECTION_NOT_FOUND");
  });
});
