import { afterAll, beforeAll, beforeEach, describe, expect, it } from "bun:test";
import type { Db } from "../src/db/connection";
import { resetAndSeed } from "../src/db/seed";
import { ADMIN_KEY, makeApp, READ_KEY, sendJson, validStudent, withKey } from "./helpers/app";
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

const errorShape = (code: string) => ({ error: { code, message: expect.any(String) } });

describe("GET /health", () => {
  it("returns status, version and time without an API key", async () => {
    const res = await app.request("/health");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ status: "ok", version: "1.0.0", time: expect.any(String) });
    expect(Number.isNaN(Date.parse(body.time))).toBe(false);
  });
});

describe("GET /api/v1/students/:student_id", () => {
  it("returns the student with every field", async () => {
    const res = await app.request("/api/v1/students/2024-00309", withKey(READ_KEY));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/json");
    expect(await res.json()).toEqual({
      student_id: "2024-00309",
      first_name: "Ana Maria",
      last_name: "O'Reilly",
      course: "BSIT",
      year_level: 3,
      section: "IT3A",
      status: "Active",
      created_at: expect.any(String),
      updated_at: expect.any(String),
    });
  });

  it("does not hide inactive or graduated students", async () => {
    const res = await app.request("/api/v1/students/2023-00501", withKey(READ_KEY));
    expect(res.status).toBe(200);
    expect((await res.json()).status).toBe("Graduated");
  });

  it("returns 404 STUDENT_NOT_FOUND for an unknown id", async () => {
    const res = await app.request("/api/v1/students/2026-99999", withKey(READ_KEY));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual(errorShape("STUDENT_NOT_FOUND"));
  });

  it("returns 404 for a malformed id", async () => {
    const res = await app.request("/api/v1/students/not-an-id", withKey(READ_KEY));
    expect(res.status).toBe(404);
  });
});

describe("authentication and authorization", () => {
  it("returns 401 when X-API-Key is missing", async () => {
    const res = await app.request("/api/v1/students/2026-00101");
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: { code: "UNAUTHORIZED", message: "Missing X-API-Key header" } });
  });

  it("returns 401 for an unknown key", async () => {
    const res = await app.request("/api/v1/students/2026-00101", withKey("wrong-key-0123456789"));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: { code: "UNAUTHORIZED", message: "Invalid API key" } });
  });

  it("returns 403 when the read key is used on POST, PUT and DELETE", async () => {
    const post = await app.request("/api/v1/students", sendJson("POST", validStudent, READ_KEY));
    const put = await app.request("/api/v1/students/2026-00101", sendJson("PUT", validStudent, READ_KEY));
    const del = await app.request("/api/v1/students/2026-00101", { method: "DELETE", ...withKey(READ_KEY) });
    for (const res of [post, put, del]) {
      expect(res.status).toBe(403);
      expect(await res.json()).toEqual(errorShape("FORBIDDEN"));
    }
  });

  it("lets the admin key use read endpoints too", async () => {
    const res = await app.request("/api/v1/students/2026-00101", withKey(ADMIN_KEY));
    expect(res.status).toBe(200);
  });
});

describe("POST /api/v1/students", () => {
  it("creates a student: 201, Location header, and the stored record", async () => {
    const res = await app.request("/api/v1/students", sendJson("POST", validStudent));
    expect(res.status).toBe(201);
    expect(res.headers.get("location")).toBe("/api/v1/students/2026-00123");
    const body = await res.json();
    expect(body).toEqual({ ...validStudent, created_at: expect.any(String), updated_at: expect.any(String) });

    const get = await app.request("/api/v1/students/2026-00123", withKey(READ_KEY));
    expect(await get.json()).toEqual(body);
  });

  it("trims text and stores the section in uppercase", async () => {
    const res = await app.request(
      "/api/v1/students",
      sendJson("POST", { ...validStudent, first_name: "  Juan  ", section: "it3a" }),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.first_name).toBe("Juan");
    expect(body.section).toBe("IT3A");
  });

  it("returns 409 STUDENT_EXISTS for a duplicate student_id", async () => {
    const res = await app.request("/api/v1/students", sendJson("POST", { ...validStudent, student_id: "2026-00101" }));
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      error: { code: "STUDENT_EXISTS", message: "Student 2026-00101 already exists", details: { student_id: "2026-00101" } },
    });
  });

  it("returns 422 with one entry per missing field", async () => {
    const res = await app.request("/api/v1/students", sendJson("POST", { student_id: "2026-00123" }));
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(body.error.details.fields.map((f: { field: string }) => f.field).sort()).toEqual(
      ["course", "first_name", "last_name", "section", "status", "year_level"],
    );
  });

  it("returns 422 for a bad student_id format, year_level and status", async () => {
    const res = await app.request(
      "/api/v1/students",
      sendJson("POST", { ...validStudent, student_id: "26-123", year_level: 7, status: "Dropped" }),
    );
    expect(res.status).toBe(422);
    const fields = (await res.json()).error.details.fields;
    expect(fields).toContainEqual({ field: "student_id", message: "must look like YYYY-NNNNN, e.g. 2026-00123" });
    expect(fields).toContainEqual({ field: "year_level", message: "must be 1 to 5" });
    expect(fields.map((f: { field: string }) => f.field)).toContain("status");
  });

  it("returns 422 for unknown fields", async () => {
    const res = await app.request("/api/v1/students", sendJson("POST", { ...validStudent, nickname: "JT" }));
    expect(res.status).toBe(422);
    expect(JSON.stringify(await res.json())).toContain("nickname");
  });

  it("returns 422 when the body is JSON but not an object", async () => {
    const res = await app.request("/api/v1/students", sendJson("POST", "[1, 2, 3]"));
    expect(res.status).toBe(422);
  });

  it("returns 400 MALFORMED_JSON for broken JSON", async () => {
    const res = await app.request("/api/v1/students", sendJson("POST", '{"student_id": "2026-00123",'));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: { code: "MALFORMED_JSON", message: "The request body is not valid JSON" } });
  });

  it("returns 415 when Content-Type is not application/json", async () => {
    const res = await app.request("/api/v1/students", {
      method: "POST",
      headers: { "X-API-Key": ADMIN_KEY, "Content-Type": "text/plain" },
      body: JSON.stringify(validStudent),
    });
    expect(res.status).toBe(415);
    expect(await res.json()).toEqual(errorShape("UNSUPPORTED_MEDIA_TYPE"));
  });

  it("accepts application/json with a charset", async () => {
    const res = await app.request("/api/v1/students", {
      method: "POST",
      headers: { "X-API-Key": ADMIN_KEY, "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify(validStudent),
    });
    expect(res.status).toBe(201);
  });
});

describe("PUT /api/v1/students/:student_id", () => {
  const { student_id: _, ...update } = { ...validStudent, first_name: "Andrea Mae", status: "Inactive" };

  it("replaces the student and returns it", async () => {
    const res = await app.request("/api/v1/students/2026-00101", sendJson("PUT", update));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ ...update, student_id: "2026-00101" });
    expect(body.updated_at >= body.created_at).toBe(true);
  });

  it("accepts a matching student_id in the body", async () => {
    const res = await app.request("/api/v1/students/2026-00101", sendJson("PUT", { ...update, student_id: "2026-00101" }));
    expect(res.status).toBe(200);
  });

  it("returns 422 when the body student_id differs from the URL", async () => {
    const res = await app.request("/api/v1/students/2026-00101", sendJson("PUT", { ...update, student_id: "2026-00102" }));
    expect(res.status).toBe(422);
    expect((await res.json()).error.details.fields[0].field).toBe("student_id");
  });

  it("returns 422 when a field is missing (PUT is a full update)", async () => {
    const { status: _s, ...partial } = update;
    const res = await app.request("/api/v1/students/2026-00101", sendJson("PUT", partial));
    expect(res.status).toBe(422);
  });

  it("returns 404 for an unknown student", async () => {
    const res = await app.request("/api/v1/students/2026-99999", sendJson("PUT", update));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual(errorShape("STUDENT_NOT_FOUND"));
  });
});

describe("DELETE /api/v1/students/:student_id", () => {
  it("returns 204 with no body, after which the student is gone", async () => {
    const res = await app.request("/api/v1/students/2026-00101", { method: "DELETE", ...withKey(ADMIN_KEY) });
    expect(res.status).toBe(204);
    expect(await res.text()).toBe("");
    const get = await app.request("/api/v1/students/2026-00101", withKey(READ_KEY));
    expect(get.status).toBe(404);
  });

  it("returns 404 for an unknown student", async () => {
    const res = await app.request("/api/v1/students/2026-99999", { method: "DELETE", ...withKey(ADMIN_KEY) });
    expect(res.status).toBe(404);
  });
});
